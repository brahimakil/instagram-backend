



const express = require('express');
const router = express.Router();

// Login
router.post('/connect', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    const result = await req.instagramService.login(username, password);
    res.json(result);
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Import session
router.post('/import-session', async (req, res) => {
  try {
    const { sessionData } = req.body;
    
    if (!sessionData) {
      return res.status(400).json({ error: 'Session data required' });
    }
    
    // Parse the cookies array
    let cookiesArray;
    try {
      cookiesArray = typeof sessionData === 'string' ? JSON.parse(sessionData) : sessionData;
    } catch (parseError) {
      return res.status(400).json({ error: 'Invalid JSON format' });
    }
    
    if (!Array.isArray(cookiesArray)) {
      return res.status(400).json({ error: 'Session data must be an array of cookies' });
    }
    
    // Use the new method that handles browser cookies
    const result = await req.instagramService.loginWithCookies(cookiesArray);
    res.json(result);
    
  } catch (error) {
    console.error('Session import error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ NEW: Submit challenge code
router.post('/challenge/submit', async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Verification code required' });
    }
    
    const result = await req.instagramService.submitChallengeCode(code);
    res.json(result);
    
  } catch (error) {
    console.error('Challenge submission error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get status
router.get('/status', (req, res) => {
  try {
    const status = req.instagramService.getStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get threads/conversations
router.get('/threads', async (req, res) => {
  try {
    const threads = await req.instagramService.getThreads();
    res.json(threads);
  } catch (error) {
    console.error('Get threads error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Send message to thread
router.post('/send/thread/:threadId', async (req, res) => {
  try {
    const { threadId } = req.params;
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message required' });
    }
    
    await req.instagramService.sendMessage(threadId, message);
    res.json({ success: true, message: 'Message sent' });
    
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Send direct message to username
router.post('/send/user', async (req, res) => {
  try {
    const { username, message } = req.body;
    
    if (!username || !message) {
      return res.status(400).json({ error: 'Username and message required' });
    }
    
    await req.instagramService.sendDirectMessage(username, message);
    res.json({ success: true, message: 'DM sent' });
    
  } catch (error) {
    console.error('Send DM error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Send to multiple threads
router.post('/send/multiple', async (req, res) => {
  try {
    const { threadIds, message } = req.body;
    
    if (!threadIds || !Array.isArray(threadIds) || !message) {
      return res.status(400).json({ error: 'Thread IDs array and message required' });
    }
    
    const results = {
      success: [],
      failed: []
    };
    
    for (const threadId of threadIds) {
      try {
        await req.instagramService.sendMessage(threadId, message);
        results.success.push(threadId);
      } catch (error) {
        results.failed.push({ threadId, error: error.message });
      }
    }
    
    res.json(results);
    
  } catch (error) {
    console.error('Send multiple error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Disconnect
router.post('/disconnect', async (req, res) => {
  try {
    await req.instagramService.disconnect();
    res.json({ success: true, message: 'Disconnected' });
  } catch (error) {
    console.error('Disconnect error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Share content (similar to WhatsApp)
router.post('/share', async (req, res) => {
  try {
    const { selectedContent, threadIds, delaySeconds = 5 } = req.body;
    
    if (!selectedContent || !threadIds || threadIds.length === 0) {
      return res.status(400).json({ error: 'Content and thread IDs required' });
    }
    
    const results = {
      success: [],
      failed: []
    };
    
    // Helper to check if URL is valid
    function isValidUrl(string) {
      if (!string) return false;
      try {
        if (string.startsWith('data:')) return false;
        new URL(string);
        return string.startsWith('http://') || string.startsWith('https://');
      } catch (_) {
        return false;
      }
    }
    
    // ✅ Helper to obfuscate URLs so Instagram doesn't detect them as links
    function obfuscateUrl(url) {
      if (!url) return url;
      
      // Replace protocol to prevent auto-linking
      url = url.replace('https://', 'hxxps://');
      url = url.replace('http://', 'hxxp://');
      
      // Add spaces around dots to break the link
      url = url.replace(/\./g, ' . ');
      
      return url;
    }
    
    // Helper function to format content message with OBFUSCATED URLs
    function formatContentMessage(item) {
      let message = '';

      switch (item.type) {
        case 'legend':
          message = `🏛️ *Legend: ${item.nameAr || item.nameEn}*\n\n`;
          message += `📖 ${item.descriptionAr || item.descriptionEn}\n\n`;
          break;

        case 'martyr':
          message = `🌹 *Martyr: ${item.nameAr || item.nameEn}*\n\n`;
          if (item.jihadistNameAr || item.jihadistNameEn) {
            message += `⚔️ Jihadist Name: ${item.jihadistNameAr || item.jihadistNameEn}\n`;
          }
          if (item.familyStatus) {
            message += `👨‍👩‍👧‍👦 Family Status: ${item.familyStatus}\n`;
          }
          if (item.numberOfChildren) {
            message += `👶 Children: ${item.numberOfChildren}\n`;
          }
          if (item.dateOfShahada) {
            message += `📅 Date of Shahada: ${new Date(item.dateOfShahada).toLocaleDateString()}\n`;
          }
          if (item.storyAr || item.storyEn) {
            const story = item.storyAr || item.storyEn;
            message += `📖 ${story.substring(0, 200)}${story.length > 200 ? '...' : ''}\n`;
          }
          message += `\n`;
          break;

        case 'location':
          message = `📍 *Location: ${item.nameAr || item.nameEn}*\n\n`;
          message += `📖 ${item.descriptionAr || item.descriptionEn}\n`;
          if (item.latitude && item.longitude) {
            message += `🌍 Coordinates: ${item.latitude}, ${item.longitude}\n`;
          }
          message += `\n`;
          break;

        case 'activity':
          message = `🎯 *Activity: ${item.nameAr || item.nameEn}*\n\n`;
          message += `📖 ${item.descriptionAr || item.descriptionEn}\n`;
          if (item.date) {
            message += `📅 Date: ${new Date(item.date).toLocaleDateString()}\n`;
          }
          if (item.time) {
            message += `⏰ Time: ${item.time}\n`;
          }
          if (item.durationHours) {
            message += `⏳ Duration: ${item.durationHours}h\n`;
          }
          message += `\n`;
          break;

        case 'news':
          message = `📰 *News: ${item.titleAr || item.titleEn}*\n\n`;
          message += `📖 ${item.descriptionAr || item.descriptionEn}\n`;
          if (item.publishDate) {
            message += `📅 Published: ${new Date(item.publishDate).toLocaleDateString()}\n`;
          }
          message += `\n`;
          break;

        case 'liveNews':
          message = `🔴 *LIVE NEWS: ${item.titleAr || item.titleEn}*\n\n`;
          message += `📖 ${item.descriptionAr || item.descriptionEn}\n`;
          if (item.liveStartTime) {
            message += `⏰ Started: ${new Date(item.liveStartTime).toLocaleString()}\n`;
          }
          if (item.liveDurationHours) {
            message += `⏳ Duration: ${item.liveDurationHours}h\n`;
          }
          message += `\n`;
          break;

        default:
          message = `📄 ${item.nameAr || item.nameEn || item.titleAr || item.titleEn}\n\n`;
          message += `${item.descriptionAr || item.descriptionEn || ''}\n\n`;
      }

      // ✅ ADD OBFUSCATED URLs (won't trigger Instagram's link blocker)
      let hasMedia = false;
      
      if (item.mainIcon && isValidUrl(item.mainIcon)) {
        message += `\n📎 ICON:\n${obfuscateUrl(item.mainIcon)}\n`;
        hasMedia = true;
      }

      if (item.mainImage && isValidUrl(item.mainImage)) {
        message += `\n🖼️ IMAGE:\n${obfuscateUrl(item.mainImage)}\n`;
        hasMedia = true;
      }

      // Add regular images
      if (item.images && Array.isArray(item.images) && item.images.length > 0) {
        message += `\n📷 IMAGES:\n`;
        item.images.forEach((image, index) => {
          const url = typeof image === 'string' ? image : image.url;
          if (url && isValidUrl(url)) {
            message += `${index + 1}. ${obfuscateUrl(url)}\n`;
          }
        });
        hasMedia = true;
      }

      // Add 360° photos
      if (item.photos360 && Array.isArray(item.photos360) && item.photos360.length > 0) {
        message += `\n🌐 360° PHOTOS:\n`;
        item.photos360.forEach((photo, index) => {
          const url = typeof photo === 'string' ? photo : photo.url;
          if (url && isValidUrl(url)) {
            message += `${index + 1}. ${obfuscateUrl(url)}\n`;
          }
        });
        hasMedia = true;
      }

      // Add videos
      if (item.videos && Array.isArray(item.videos) && item.videos.length > 0) {
        message += `\n🎥 VIDEOS:\n`;
        item.videos.forEach((video, index) => {
          const url = typeof video === 'string' ? video : video.url;
          if (url && isValidUrl(url)) {
            message += `${index + 1}. ${obfuscateUrl(url)}\n`;
          }
        });
        hasMedia = true;
      }

      // ✅ Add instructions if media was included
      if (hasMedia) {
        message += `\n💡 To access links: Remove spaces from dots and change hxxps to https\n`;
      }

      return message.trim();
    }
    
    // Send each content item to each thread
    let messageCount = 0;
    
    for (const content of selectedContent) {
      for (const thread of threadIds) {
        try {
          // ✅ Add delay BEFORE sending (except first message)
          if (messageCount > 0) {
            // Instagram requires longer delays - minimum 10 seconds, randomized
            const minDelay = Math.max(delaySeconds, 10); // At least 10 seconds
            const actualDelay = minDelay + Math.random() * 5; // Add 0-5 seconds random
            console.log(`⏳ Waiting ${actualDelay.toFixed(1)}s before next message...`);
            await new Promise(resolve => setTimeout(resolve, actualDelay * 1000));
          }
          messageCount++;
          
          // Build detailed message from content
          const message = formatContentMessage(content);
          
          console.log(`📤 Sending content "${content.nameAr || content.titleAr}" (${messageCount}/${selectedContent.length * threadIds.length}) to thread ${thread}...`);
          await req.instagramService.sendMessage(thread, message);
          
          results.success.push({ thread, content: content.id });
          console.log(`✅ Sent successfully`);
          
        } catch (error) {
          console.error(`❌ Failed to send:`, error.message);
          results.failed.push({ thread, content: content.id, error: error.message });
        }
      }
    }
    
    console.log(`📊 Share complete: ${results.success.length} success, ${results.failed.length} failed`);
    res.json(results);
    
  } catch (error) {
    console.error('Share content error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;