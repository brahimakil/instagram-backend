const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const http = require('http');
require('dotenv').config();

const instagramRoutes = require('./routes/instagram');
const { initializeFirebase } = require('./config/firebase');
const InstagramService = require('./services/instagramService');

const app = express();
const server = http.createServer(app);

// CORS configuration - using FRONTEND_URL from .env
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173,http://localhost:5174,https://balagh-admin.vercel.app')
  .split(',')
  .map(s => s.trim());

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    
    // Allow all localhost and 127.0.0.1 origins
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      return callback(null, true);
    }
    
    // Allow configured origins
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // Log rejected origins for debugging
    console.log('❌ CORS blocked origin:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  credentials: true,
  // Add these headers explicitly
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Range', 'X-Content-Range']
};

const io = new Server(server, {
  cors: corsOptions
});

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Initialize Firebase
initializeFirebase();

// Initialize Instagram Service
const instagramService = new InstagramService(io);

// Add services to request object
app.use((req, res, next) => {
  req.instagramService = instagramService;
  next();
});

// Routes
app.use('/api/instagram', instagramRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'Instagram Backend is running!', 
    timestamp: new Date()
  });
});

// Socket.io connection
io.on('connection', (socket) => {
  console.log('✅ Admin connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('❌ Admin disconnected:', socket.id);
  });
});

// Error handling
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection:', reason);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down...');
  if (instagramService) {
    await instagramService.disconnect();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\n🛑 SIGINT received, shutting down...');
  if (instagramService) {
    await instagramService.disconnect();
  }
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

const PORT = process.env.PORT || 3002;
server.listen(PORT, () => {
  console.log(`🚀 Instagram Backend running on port ${PORT}`);
  console.log(`📸 Admin Panel should connect to: http://localhost:${PORT}`);
});
