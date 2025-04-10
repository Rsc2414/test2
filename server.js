const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const fileType = require('file-type');
const rateLimit = require('express-rate-limit');

const app = express();

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// Rate limiting
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many uploads from this IP'
});

// Configure upload directory
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer configuration
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
  const filetypes = /jpe?g|png|gif|webp/i;
  const mimetype = filetypes.test(file.mimetype);
  const extname = filetypes.test(path.extname(file.originalname));

  if (mimetype && extname) {
    return cb(null, true);
  }
  cb(new Error(`Only ${filetypes.toString()} files allowed`));
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 1
  }
});

// Validate image file content
const validateImage = (filePath) => {
  const buffer = fs.readFileSync(filePath);
  const type = fileType.fromBuffer(buffer);
  
  if (!type || !type.mime.startsWith('image/')) {
    fs.unlinkSync(filePath);
    throw new Error('Invalid image content');
  }
  return true;
};

// Dashboard
app.get('/', (req, res) => {
  try {
    const files = fs.readdirSync(uploadDir);
    const images = files
      .filter(file => ['.jpg', '.jpeg', '.png', '.gif', '.webp']
        .includes(path.extname(file).toLowerCase()))
      .sort((a, b) => 
        fs.statSync(path.join(uploadDir, b)).mtimeMs - 
        fs.statSync(path.join(uploadDir, a)).mtimeMs
      );

    res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Image Dashboard</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 20px;
          background-color: #f5f5f5;
        }
        .dashboard {
          max-width: 1200px;
          margin: 0 auto;
        }
        .upload-form {
          background: white;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          margin-bottom: 20px;
        }
        .gallery {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
          gap: 15px;
        }
        .image-card {
          background: white;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .image-card img {
          width: 100%;
          height: 200px;
          object-fit: cover;
        }
        .image-info {
          padding: 10px;
        }
        .status {
          padding: 10px;
          margin: 10px 0;
          border-radius: 4px;
        }
        .success {
          background-color: #dff0d8;
          color: #3c763d;
        }
        .error {
          background-color: #f2dede;
          color: #a94442;
        }
      </style>
    </head>
    <body>
      <div class="dashboard">
        <h1>Image Upload Dashboard</h1>
        
        ${req.query.success ? `<div class="status success">${decodeURIComponent(req.query.success)}</div>` : ''}
        ${req.query.error ? `<div class="status error">${decodeURIComponent(req.query.error)}</div>` : ''}
        
        <div class="upload-form">
          <h2>Upload Image</h2>
          <form action="/upload" method="POST" enctype="multipart/form-data">
            <input type="file" name="image" accept="image/jpeg,image/png,image/gif,image/webp" required>
            <button type="submit">Upload</button>
          </form>
        </div>
        
        <h2>Uploaded Images (${images.length})</h2>
        <div class="gallery">
          ${images.map(img => `
            <div class="image-card">
              <img src="/uploads/${img}" alt="${img}">
              <div class="image-info">
                <p>${img}</p>
                <a href="/uploads/${img}" target="_blank">View</a>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </body>
    </html>
    `);
  } catch (err) {
    res.status(500).send('Error loading dashboard');
  }
});

// Upload endpoint
app.post('/upload', uploadLimiter, upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    validateImage(path.join(uploadDir, req.file.filename));

    res.status(201).json({
      success: true,
      filename: req.file.filename,
      url: `/uploads/${req.file.filename}`
    });
  } catch (err) {
    res.status(400).json({ 
      error: err.message,
      allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    });
  }
});

// Error handling
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).redirect(`/?error=${encodeURIComponent(err.message)}`);
  }
  console.error(err.stack);
  res.status(500).redirect(`/?error=${encodeURIComponent('Server error')}`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Keep Glitch alive
setInterval(() => {
  console.log('Keep-alive ping');
}, 5 * 60 * 1000);