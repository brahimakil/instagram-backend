const { IgApiClient } = require('instagram-private-api');
const { getDb } = require('../config/firebase');

class InstagramService {
  constructor(io) {
    this.io = io;
    this.ig = new IgApiClient();
    this.db = null;
    this.isConnected = false;
    this.currentUser = null;
    this.sessionData = null;
    this.pendingChallenge = null; // ✅ NEW: Store challenge state
    
    // ✅ IMPORTANT: Simulate a real device to avoid detection
    this.ig.state.generateDevice('instagram_user_12345'); // Use consistent device ID
    this.ig.state.proxyUrl = null; // Set if using proxy
    
    // Initialize database
    try {
      this.db = getDb();
      console.log('✅ Database initialized in Instagram service');
    } catch (error) {
      console.error('❌ Failed to initialize database:', error);
      this.db = null;
    }

    // Auto-restore session on startup
    this.autoRestore();
  }

  // Auto-restore session on startup
  async autoRestore() {
    try {
      console.log('🔄 Checking for existing Instagram session...');
      
      const sessionDoc = await this.db.collection('instagramSessions').doc('current').get();
      
      if (sessionDoc.exists) {
        const data = sessionDoc.data();
        if (data.session && data.cookies) {
          console.log('📸 Found existing session, restoring...');
          try {
            await this.restoreSession(data.session, data.cookies);
          } catch (error) {
            console.log('⚠️ Session expired or invalid, clearing...');
            // Delete expired session
            await this.db.collection('instagramSessions').doc('current').delete();
            console.log('📸 Please import cookies again');
          }
        }
      } else {
        console.log('📸 No existing Instagram session found');
      }
    } catch (error) {
      console.error('❌ Auto-restore failed:', error);
    }
  }

  // ✅ NEW: Login to Instagram with challenge handling
  async login(username, password) {
    try {
      console.log(`🔐 Logging into Instagram as ${username}...`);
      
      this.ig.state.generateDevice(username);
      
      // Login
      const auth = await this.ig.account.login(username, password);
      
      this.isConnected = true;
      this.currentUser = auth;
      this.pendingChallenge = null;
      
      // Save session to Firebase
      const session = await this.ig.state.serialize();
      delete session.constants;
      
      const cookies = await this.ig.state.serializeCookieJar();
      
      await this.db.collection('instagramSessions').doc('current').set({
        username,
        session,
        cookies: JSON.stringify(cookies),
        loginTime: new Date(),
        userId: auth.pk
      });
      
      console.log('✅ Instagram login successful');
      
      // Emit success event
      this.io.emit('instagram-ready', {
        username,
        userId: auth.pk
      });
      
      return { 
        success: true, 
        message: 'Login successful',
        user: {
          username,
          userId: auth.pk
        }
      };
      
    } catch (error) {
      console.error('❌ Instagram login failed:', error);
      this.isConnected = false;
      
      // ✅ NEW: Handle checkpoint challenge
      if (error.name === 'IgCheckpointError') {
        console.log('⚠️ Challenge required! Storing challenge state...');
        
        this.pendingChallenge = {
          username,
          password,
          error
        };
        
        // Emit challenge required event
        this.io.emit('instagram-challenge-required', {
          username,
          message: 'Verification code required. Check your Instagram app or email.'
        });
        
        return {
          success: false,
          challengeRequired: true,
          message: 'Instagram requires verification. Please enter the code sent to your device.'
        };
      }
      
      // Emit error event
      this.io.emit('instagram-auth-failed', {
        reason: error.message
      });
      
      throw error;
    }
  }

  // ✅ NEW: Submit challenge code
  async submitChallengeCode(code) {
    try {
      if (!this.pendingChallenge) {
        throw new Error('No pending challenge found');
      }

      console.log('🔐 Submitting challenge code...');
      
      const { username, password } = this.pendingChallenge;
      
      // Process the challenge
      await this.ig.challenge.auto(true);
      
      console.log('📱 Selecting verification method...');
      await this.ig.challenge.selectVerifyMethod('1'); // 1 = phone, 0 = email
      
      console.log('✅ Sending security code...');
      const result = await this.ig.challenge.sendSecurityCode(code);
      
      // Now try to login again
      const auth = await this.ig.account.login(username, password);
      
      this.isConnected = true;
      this.currentUser = auth;
      this.pendingChallenge = null;
      
      // Save session
      const session = await this.ig.state.serialize();
      delete session.constants;
      
      const cookies = await this.ig.state.serializeCookieJar();
      
      await this.db.collection('instagramSessions').doc('current').set({
        username,
        session,
        cookies: JSON.stringify(cookies),
        loginTime: new Date(),
        userId: auth.pk
      });
      
      console.log('✅ Challenge completed! Login successful');
      
      this.io.emit('instagram-ready', {
        username,
        userId: auth.pk
      });
      
      return {
        success: true,
        message: 'Challenge completed successfully'
      };
      
    } catch (error) {
      console.error('❌ Challenge submission failed:', error);
      throw error;
    }
  }

  // Restore session from saved data
  async restoreSession(session, cookies) {
    try {
      console.log('🔄 Restoring Instagram session...');
      
      // ✅ REMOVED: Age check that was causing false rejections
      // Let Instagram decide if the session is valid, not us
      
      await this.ig.state.deserialize(session);
      
      if (cookies) {
        const cookieJar = typeof cookies === 'string' ? JSON.parse(cookies) : cookies;
        await this.ig.state.deserializeCookieJar(cookieJar);
      }
      
      // Verify session is valid by making a test API call
      const user = await this.ig.account.currentUser();
      
      this.isConnected = true;
      this.currentUser = user;
      
      console.log(`✅ Session restored! Logged in as @${user.username}`);
      
      this.io.emit('instagram-ready', {
        username: user.username,
        userId: user.pk
      });
      
      return {
        success: true,
        user: {
          username: user.username,
          userId: user.pk,
          fullName: user.full_name
        }
      };
      
    } catch (error) {
      console.error('❌ Session restore failed:', error.message);
      this.isConnected = false;
      throw error;
    }
  }

  // Get direct inbox threads (DM conversations)
  async getThreads() {
    try {
      if (!this.isConnected) {
        throw new Error('Not connected to Instagram');
      }
      
      console.log('📨 Fetching Instagram threads...');
      
      const inbox = await this.ig.feed.directInbox().items();
      
      const threads = inbox.map(thread => ({
        id: thread.thread_id,
        name: thread.thread_title || thread.users.map(u => u.username).join(', '),
        users: thread.users.map(u => ({
          id: u.pk,
          username: u.username,
          fullName: u.full_name,
          profilePic: u.profile_pic_url
        })),
        lastMessage: thread.last_permanent_item?.text || '',
        timestamp: thread.last_permanent_item?.timestamp,
        isGroup: thread.is_group
      }));
      
      console.log(`✅ Fetched ${threads.length} threads`);
      
      return threads;
      
    } catch (error) {
      console.error('❌ Failed to fetch threads:', error);
      throw error;
    }
  }

  // ✅ UPDATED: Add human-like delays
  async sendMessage(threadId, text) {
    try {
      console.log(`📤 Sending message to thread ${threadId}...`);
      
      // ✅ Simulate human typing delay (50-150ms per character)
      const typingDelay = Math.random() * 100 * text.length + 1000;
      await this.sleep(typingDelay);
      
      const thread = this.ig.entity.directThread(threadId);
      
      // ✅ Mark thread as seen before sending (human behavior)
      try {
        await thread.markItemSeen(thread.items[0]?.item_id);
      } catch (e) {
        // Ignore if no items
      }
      
      // Small delay before sending
      await this.sleep(500 + Math.random() * 1000);
      
      await thread.broadcastText(text);
      
      console.log(`✅ Message sent successfully to thread ${threadId}`);
      return { success: true };
    } catch (error) {
      console.error('❌ Failed to send message:', error);
      
      // ✅ If login required, mark as disconnected
      if (error.message?.includes('login_required')) {
        this.isConnected = false;
        this.io.emit('instagram-disconnected', { reason: 'Login required - session expired' });
      }
      
      throw error;
    }
  }

  // Send message to username directly
  async sendDirectMessage(username, message) {
    try {
      if (!this.isConnected) {
        throw new Error('Not connected to Instagram');
      }
      
      console.log(`📤 Sending DM to @${username}...`);
      
      // Get user ID from username
      const userId = await this.ig.user.getIdByUsername(username);
      
      // Create or get thread
      const thread = this.ig.entity.directThread([userId.toString()]);
      await thread.broadcastText(message);
      
      console.log('✅ DM sent successfully');
      
      return { success: true };
      
    } catch (error) {
      console.error('❌ Failed to send DM:', error);
      throw error;
    }
  }

  // Send image/media
  async sendImage(threadId, imageBuffer, caption = '') {
    try {
      if (!this.isConnected) {
        throw new Error('Not connected to Instagram');
      }
      
      console.log(`📷 Sending image to thread ${threadId}...`);
      
      const thread = this.ig.entity.directThread(threadId);
      await thread.broadcastPhoto({
        file: imageBuffer,
        caption
      });
      
      console.log('✅ Image sent successfully');
      
      return { success: true };
      
    } catch (error) {
      console.error('❌ Failed to send image:', error);
      throw error;
    }
  }

  // Get connection status
  getStatus() {
    return {
      connected: this.isConnected,
      username: this.currentUser?.username || null,
      userId: this.currentUser?.pk || null
    };
  }

  // Disconnect/logout
  async disconnect() {
    try {
      console.log('🔌 Disconnecting from Instagram...');
      
      this.isConnected = false;
      this.currentUser = null;
      this.ig = new IgApiClient();
      
      // Clear session from Firebase
      if (this.db) {
        await this.db.collection('instagramSessions').doc('current').delete();
      }
      
      console.log('✅ Disconnected from Instagram');
      
      this.io.emit('instagram-disconnected', {
        reason: 'Manual disconnect'
      });
      
      return { success: true };
      
    } catch (error) {
      console.error('❌ Disconnect error:', error);
      throw error;
    }
  }

  // ✅ NEW: Import session from Instagram cookies
  async loginWithSession(sessionData) {
    try {
      console.log('🔐 Logging into Instagram with session data...');
      
      // Deserialize the session
      await this.ig.state.deserialize(sessionData);
      
      // Verify session is valid
      const user = await this.ig.account.currentUser();
      
      this.isConnected = true;
      this.currentUser = user;
      
      // Save session to Firebase
      const session = await this.ig.state.serialize();
      delete session.constants;
      
      const cookies = await this.ig.state.serializeCookieJar();
      
      await this.db.collection('instagramSessions').doc('current').set({
        username: user.username,
        session,
        cookies: JSON.stringify(cookies),
        loginTime: new Date(),
        userId: user.pk
      });
      
      console.log('✅ Instagram session imported successfully');
      
      this.io.emit('instagram-ready', {
        username: user.username,
        userId: user.pk
      });
      
      return {
        success: true,
        message: 'Session imported successfully',
        user: {
          username: user.username,
          userId: user.pk
        }
      };
      
    } catch (error) {
      console.error('❌ Session import failed:', error);
      this.isConnected = false;
      throw error;
    }
  }

  // ✅ FIXED: Import session from Instagram browser cookies (PROPER VERSION)
  async loginWithCookies(cookiesArray) {
    try {
      console.log('🔐 Importing Instagram session from browser cookies...');
      
      // Set cookies properly using the tough-cookie API
      for (const cookie of cookiesArray) {
        try {
          await this.ig.state.cookieJar.setCookie(
            `${cookie.name}=${cookie.value}; Domain=${cookie.domain}; Path=${cookie.path}${cookie.secure ? '; Secure' : ''}${cookie.httpOnly ? '; HttpOnly' : ''}`,
            'https://www.instagram.com'
          );
          
          console.log(`✅ Set cookie: ${cookie.name}`);
        } catch (err) {
          console.log(`⚠️ Warning: Failed to set cookie ${cookie.name}:`, err.message);
        }
      }
      
      // Set device ID from cookies
      const igDidCookie = cookiesArray.find(c => c.name === 'ig_did');
      if (igDidCookie) {
        this.ig.state.deviceId = igDidCookie.value;
        console.log(`✅ Set device ID: ${igDidCookie.value}`);
      }
      
      console.log('🔍 Verifying session with Instagram...');
      
      // Try to get current user to verify session works
      const user = await this.ig.account.currentUser();
      
      this.isConnected = true;
      this.currentUser = user;
      
      // Save session to Firebase
      const session = await this.ig.state.serialize();
      delete session.constants;
      
      // ✅ Clean undefined values from session
      const cleanSession = this.removeUndefined(session);
      
      const cookies = await this.ig.state.serializeCookieJar();
      
      await this.db.collection('instagramSessions').doc('current').set({
        username: user.username,
        session: cleanSession, // ✅ Use cleaned session instead of session
        cookies: JSON.stringify(cookies),
        loginTime: new Date(),
        userId: user.pk
      });
      
      console.log(`✅ Instagram session imported successfully for @${user.username}`);
      
      this.io.emit('instagram-ready', {
        username: user.username,
        userId: user.pk
      });
      
      return {
        success: true,
        message: 'Session imported successfully',
        user: {
          username: user.username,
          userId: user.pk
        }
      };
      
    } catch (error) {
      console.error('❌ Session import failed:', error);
      this.isConnected = false;
      throw error;
    }
  }

  // ✅ NEW: Helper function to remove undefined values recursively
  removeUndefined(obj) {
    if (Array.isArray(obj)) {
      return obj.map(item => this.removeUndefined(item)).filter(item => item !== undefined);
    } else if (obj !== null && typeof obj === 'object') {
      return Object.entries(obj).reduce((acc, [key, value]) => {
        const cleaned = this.removeUndefined(value);
        if (cleaned !== undefined) {
          acc[key] = cleaned;
        }
        return acc;
      }, {});
    }
    return obj;
  }

  // ✅ Helper for delays
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = InstagramService;