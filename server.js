const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const rateLimit = require('express-rate-limit');

const app = express();

// Enhanced security middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting to prevent abuse
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many upload requests from this IP, please try again later'
});

// Configure upload directory
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Enhanced multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname).toLowerCase());
  }
});

const fileFilter = (req, file, cb) => {
  const filetypes = /jpe?g|png|gif/;
  const mimetype = filetypes.test(file.mimetype);
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  
  if (mimetype && extname) {
    return cb(null, true);
  }
  cb(new Error('Only image files (JPEG, PNG, GIF) are allowed!'));
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    diskUsage: fs.statSync(uploadDir)
  });
});

// Dashboard with enhanced security
app.get('/', (req, res) => {
  try {
    const files = fs.readdirSync(uploadDir);
    const images = files.filter(file => {
      const ext = path.extname(file).toLowerCase();
      return ['.jpg', '.jpeg', '.png', '.gif'].includes(ext);
    }).sort((a, b) => {
      return fs.statSync(path.join(uploadDir, b)).mtimeMs - 
             fs.statSync(path.join(uploadDir, a)).mtimeMs;
    });

    const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Image Upload Dashboard</title>
      <style>
        /* Your existing CSS styles */
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          margin: 0;
          padding: 20px;
          background-color: #f8f9fa;
        }
        /* ... keep your existing styles ... */
        .server-info {
          background: white;
          padding: 15px;
          border-radius: 8px;
          margin: 20px 0;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <h1>Image Upload Dashboard</h1>
      
      ${req.query.success ? `<div class="status-message success">${decodeURIComponent(req.query.success)}</div>` : ''}
      ${req.query.error ? `<div class="status-message error">${decodeURIComponent(req.query.error)}</div>` : ''}
      
      <div class="server-info">
        <strong>Server Status:</strong> Online | 
        <strong>Images:</strong> ${images.length} | 
        <strong>Last Updated:</strong> ${new Date().toLocaleString()}
      </div>
      
      <!-- Your existing upload form and gallery HTML -->
      <div class="upload-form">
        <h2>Upload New Image</h2>
        <form action="/upload" method="POST" enctype="multipart/form-data">
          <input type="file" name="image" accept="image/jpeg,image/png,image/gif" required>
          <button type="submit" class="upload-btn">Upload</button>
        </form>
      </div>
      
      <!-- Your existing gallery and delete form -->
      
      <script>
        // Your existing JavaScript with enhanced error handling
        document.addEventListener('DOMContentLoaded', function() {
          try {
            // Your existing selection logic
          } catch (e) {
            console.error('Error initializing gallery:', e);
          }
        });
      </script>
    </body>
    </html>
    `;

    res.send(html);
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).send('Error loading dashboard');
  }
});

// Enhanced upload endpoint
app.post('/upload', uploadLimiter, upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    res.status(201).json({ 
      success: true,
      filename: req.file.filename,
      size: req.file.size,
      url: fileUrl,
      mimetype: req.file.mimetype
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Secure delete endpoint
app.post('/delete', (req, res) => {
  try {
    const imagesToDelete = Array.isArray(req.body.imagesToDelete) 
      ? req.body.imagesToDelete 
      : [];

    if (imagesToDelete.length === 0) {
      return res.status(400).json({ error: 'No images selected for deletion' });
    }

    const results = imagesToDelete.map(image => {
      try {
        // Validate filename
        if (!/^[\w\-\.]+$/.test(image)) {
          return { filename: image, status: 'error', message: 'Invalid filename' };
        }

        const filePath = path.join(uploadDir, image);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          return { filename: image, status: 'success' };
        }
        return { filename: image, status: 'error', message: 'File not found' };
      } catch (err) {
        return { filename: image, status: 'error', message: err.message };
      }
    });

    const successCount = results.filter(r => r.status === 'success').length;
    if (successCount === 0) {
      return res.status(400).json({ 
        error: 'No files were deleted',
        details: results
      });
    }

    res.json({
      success: true,
      deleted: successCount,
      total: imagesToDelete.length,
      details: results
    });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve static files with cache control
app.use('/uploads', express.static(uploadDir, {
  maxAge: '1d',
  setHeaders: (res, path) => {
    if (express.static.mime.lookup(path) === 'text/html') {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ 
      error: err.code === 'LIMIT_FILE_SIZE' 
        ? 'File too large (max 10MB)' 
        : err.message 
    });
  }
  
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Upload endpoint: POST http://localhost:${PORT}/upload`);
  console.log(`Health check: GET http://localhost:${PORT}/health`);
});

// Handle server shutdown gracefully
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Keep Glitch alive
const keepAlive = () => {
  setInterval(() => {
    console.log('Keeping alive:', new Date().toISOString());
  }, 5 * 60 * 1000); // Ping every 5 minutes
};

if (process.env.NODE_ENV !== 'test') {
  keepAlive();
}