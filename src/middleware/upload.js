/**
 * Multer upload middleware — memory storage for S3 uploads.
 * Disk paths kept only for legacy local static serving of old files.
 */

const path = require('path');
const fs = require('fs');
const multer = require('multer');
const {
  ALLOWED_IMAGE_MIMES,
  ALLOWED_DOCUMENT_MIMES,
  getMaxImageBytes,
  getMaxDocumentBytes,
} = require('../utils/assetValidation');

const UPLOAD_ROOT = path.join(__dirname, '../../uploads');
const DOC_DIR = path.join(UPLOAD_ROOT, 'provider_documents');
const LOGO_DIR = path.join(UPLOAD_ROOT, 'client_logos');

/** Same top-level folders as S3 bucket `akanso-assets`. */
const S3_ROOT_DIRS = [
  'admin',
  'bookings',
  'categories',
  'customers',
  'providers',
  'services',
  'temp',
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, {recursive: true});
  }
}

for (const prefix of S3_ROOT_DIRS) {
  ensureDir(path.join(UPLOAD_ROOT, prefix));
}
// Keep dirs for any legacy disk files still referenced in DB
ensureDir(DOC_DIR);
ensureDir(LOGO_DIR);

const memoryStorage = multer.memoryStorage();

function multerErrorHandler(upload) {
  return (req, res, next) => {
    upload(req, res, (err) => {
      if (err) {
        const message =
          err.code === 'LIMIT_FILE_SIZE'
            ? 'File exceeds maximum allowed size'
            : err.message || 'Upload failed';
        return res.status(400).json({
          success: false,
          error: 'Bad Request',
          message,
        });
      }
      next();
    });
  };
}

const uploadProviderDocument = multer({
  storage: memoryStorage,
  limits: {fileSize: getMaxDocumentBytes()},
  fileFilter(_req, file, cb) {
    const mime = file.mimetype === 'image/jpg' ? 'image/jpeg' : file.mimetype;
    if (!ALLOWED_DOCUMENT_MIMES.has(mime)) {
      return cb(new Error('Only images and PDF files are allowed'));
    }
    cb(null, true);
  },
}).single('file');

const uploadClientLogo = multer({
  storage: memoryStorage,
  limits: {fileSize: getMaxImageBytes()},
  fileFilter(_req, file, cb) {
    const mime = file.mimetype === 'image/jpg' ? 'image/jpeg' : file.mimetype;
    if (
      !mime ||
      mime === 'application/octet-stream' ||
      mime.startsWith('image/') ||
      ALLOWED_IMAGE_MIMES.has(mime)
    ) {
      return cb(null, true);
    }
    return cb(new Error('Only JPEG, PNG, WebP, or SVG images are allowed'));
  },
}).single('file');

const uploadProfileImage = multer({
  storage: memoryStorage,
  limits: {fileSize: getMaxImageBytes()},
  fileFilter(_req, file, cb) {
    const mime = file.mimetype === 'image/jpg' ? 'image/jpeg' : file.mimetype;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
      return cb(new Error('Only JPEG, PNG, or WebP images are allowed'));
    }
    cb(null, true);
  },
}).single('file');

module.exports = {
  uploadProviderDocument,
  uploadClientLogo,
  uploadProfileImage,
  handleProviderDocumentUpload: multerErrorHandler(uploadProviderDocument),
  handleClientLogoUpload: multerErrorHandler(uploadClientLogo),
  handleProfileImageUpload: multerErrorHandler(uploadProfileImage),
  UPLOAD_ROOT,
  DOC_DIR,
  LOGO_DIR,
  S3_ROOT_DIRS,
};
