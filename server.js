const express = require('express');
const multer = require('multer');
const cors = require('cors');
const session = require('express-session');
const bodyParser = require('body-parser');
const { BlobServiceClient } = require('@azure/storage-blob');
require('dotenv').config();

const app = express();
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  secret: 'your-secret-key-change-this', // Change this to something random
  resave: false,
  saveUninitialized: true,
  cookie: { 
    secure: false, // Set to true in production with HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Simple user credentials (hardcoded for demo - use a database in production)
const USERS = {
  'admin': 'password123',
  'user': 'user123'
};

// Azure Storage
const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
const containerClient = blobServiceClient.getContainerClient('uploaded-files');

// Serve static files (but NOT index.html yet)
app.use(express.static('public', {
  index: false // Prevent serving index.html directly
}));

// Authentication middleware
const requireAuth = (req, res, next) => {
  if (req.session && req.session.userId) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

// ===== LOGIN ENDPOINTS =====

// Login page
app.get('/', (req, res) => {
  if (req.session && req.session.userId) {
    // Already logged in, serve the portal
    res.sendFile(__dirname + '/public/portal.html');
  } else {
    // Not logged in, serve login page
    res.sendFile(__dirname + '/public/login.html');
  }
});

// Handle login
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  // Validate credentials
  if (USERS[username] && USERS[username] === password) {
    req.session.userId = username;
    res.json({ success: true, message: 'Logged in successfully' });
  } else {
    res.status(401).json({ success: false, message: 'Invalid username or password' });
  }
});

// Handle logout
app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

// Check if logged in
app.get('/api/user', (req, res) => {
  if (req.session && req.session.userId) {
    res.json({ username: req.session.userId });
  } else {
    res.status(401).json({ error: 'Not logged in' });
  }
});

// ===== PROTECTED UPLOAD ENDPOINTS =====

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Upload file (requires authentication)
app.post('/api/upload', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    if (req.file.size > 50 * 1024 * 1024) {
      return res.status(400).json({ error: 'File too large' });
    }

    const timestamp = Date.now();
    const uniqueFilename = `${timestamp}-${req.file.originalname}`;

    const blockBlobClient = containerClient.getBlockBlobClient(uniqueFilename);
    await blockBlobClient.upload(req.file.buffer, req.file.size);

    res.json({ 
      message: 'File uploaded successfully',
      filename: uniqueFilename,
      size: req.file.size,
      uploadedBy: req.session.userId
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ 
      error: 'Upload failed',
      details: error.message 
    });
  }
});

// List files (requires authentication)
app.get('/api/files', requireAuth, async (req, res) => {
  try {
    const files = [];
    for await (const blob of containerClient.listBlobsFlat()) {
      files.push({
        name: blob.name,
        size: blob.properties.contentLength,
        created: blob.properties.createdOn
      });
    }
    res.json(files);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
