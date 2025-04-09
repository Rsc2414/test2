const express = require('express');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.set('view engine', 'ejs'); // For rendering HTML
app.use(express.static('public'));

// Auto-create 'public/uploads' directory
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer configuration
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Upload endpoint
app.post('/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ success: true, url: `/uploads/${req.file.filename}` });
});

// Delete endpoint
app.delete('/image/:filename', (req, res) => {
  const filePath = path.join(uploadDir, req.params.filename);
  fs.unlink(filePath, (err) => {
    if (err) return res.status(500).json({ error: 'Failed to delete' });
    res.json({ success: true });
  });
});

// Dashboard endpoint
app.get('/dashboard', (req, res) => {
  fs.readdir(uploadDir, (err, files) => {
    if (err) return res.status(500).send('Error loading images');
    const images = files.map(file => ({
      name: file,
      url: `/uploads/${file}`
    }));
    res.render('dashboard', { images });
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.send('Image Upload Server is Running');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});