const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { BlobServiceClient } = require('@azure/storage-blob');
require('dotenv').config();

const app = express();
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// Enable CORS
app.use(cors());
app.use(express.static('public'));

// Azure Storage connection
const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
const containerClient = blobServiceClient.getContainerClient('uploaded-files');

// Health check endpoint (for Azure monitoring)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Upload endpoint
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // Validate file size
    if (req.file.size > 50 * 1024 * 1024) {
      return res.status(400).json({ error: 'File too large' });
    }

    // Generate unique filename to prevent overwrites
    const timestamp = Date.now();
    const uniqueFilename = `${timestamp}-${req.file.originalname}`;

    // Upload to Azure
    const blockBlobClient = containerClient.getBlockBlobClient(uniqueFilename);
    await blockBlobClient.upload(req.file.buffer, req.file.size);

    res.json({ 
      message: 'File uploaded successfully',
      filename: uniqueFilename,
      size: req.file.size
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ 
      error: 'Upload failed',
      details: error.message 
    });
  }
});

// List uploaded files (optional, for testing)
app.get('/files', async (req, res) => {
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
  console.log(`Health check: http://localhost:${PORT}/health`);
});
