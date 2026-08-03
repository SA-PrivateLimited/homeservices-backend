/**
 * Multer setup for provider document uploads (admin).
 */
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const UPLOAD_ROOT = path.join(__dirname, '../../uploads');
const DOC_DIR = path.join(UPLOAD_ROOT, 'provider_documents');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, {recursive: true});
  }
}

ensureDir(DOC_DIR);

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    ensureDir(DOC_DIR);
    cb(null, DOC_DIR);
  },
  filename(req, file, cb) {
    const docKey = (req.params.docKey || 'doc').replace(/[^a-zA-Z0-9_-]/g, '');
    const providerId = (req.params.providerId || 'unknown').replace(
      /[^a-zA-Z0-9_-]/g,
      '',
    );
    const ext = path.extname(file.originalname || '').toLowerCase() || '.bin';
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.pdf', '.gif'].includes(
      ext,
    )
      ? ext
      : '.bin';
    cb(
      null,
      `${providerId}_${docKey}_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}${safeExt}`,
    );
  },
});

const uploadProviderDocument = multer({
  storage,
  limits: {fileSize: 8 * 1024 * 1024},
  fileFilter(_req, file, cb) {
    const ok =
      /^image\//.test(file.mimetype) || file.mimetype === 'application/pdf';
    if (!ok) {
      return cb(new Error('Only images and PDF files are allowed'));
    }
    cb(null, true);
  },
}).single('file');

module.exports = {
  uploadProviderDocument,
  UPLOAD_ROOT,
  DOC_DIR,
};
