const fs = require('fs');
const path = require('path');
const multer = require('multer');

const uploadRoot = path.join(__dirname, '../../uploads');

function ensureUploadFolders() {
  fs.mkdirSync(path.join(uploadRoot, 'pdfs'), { recursive: true });
  fs.mkdirSync(path.join(uploadRoot, 'audio'), { recursive: true });
  fs.mkdirSync(path.join(uploadRoot, 'images'), { recursive: true });
}

ensureUploadFolders();

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const folder = file.fieldname === 'audio' || file.fieldname === 'audios'
      ? 'audio'
      : file.fieldname === 'image' || file.fieldname === 'images'
        ? 'images'
        : 'pdfs';
    cb(null, path.join(uploadRoot, folder));
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname);
    const base = path
      .basename(file.originalname, ext)
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
    cb(null, `${Date.now()}-${base || 'upload'}${ext}`);
  },
});

const allowedAudio = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/webm',
  'audio/ogg',
]);

function fileFilter(req, file, cb) {
  if ((file.fieldname === 'pdf' || file.fieldname === 'pdfs') && file.mimetype === 'application/pdf') {
    cb(null, true);
    return;
  }

  if ((file.fieldname === 'audio' || file.fieldname === 'audios') && allowedAudio.has(file.mimetype)) {
    cb(null, true);
    return;
  }

  if ((file.fieldname === 'image' || file.fieldname === 'images') && file.mimetype.startsWith('image/')) {
    cb(null, true);
    return;
  }

  cb(new Error('Only PDF documents, images, and common audio files are allowed.'));
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
});

module.exports = upload;
