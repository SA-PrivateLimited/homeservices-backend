const {randomUUID} = require('crypto');
const {pipeline} = require('stream/promises');
const BrandCreative = require('../../models/BrandCreative');
const s3 = require('../../services/s3.service');
const {validateImageBuffer} = require('../../utils/assetValidation');
const {buildAdminCreativeKey} = require('../../utils/s3Keys');

function safeDownloadName(originalName, extension) {
  const fallback = `akanso-creative${extension || '.jpg'}`;
  const raw = String(originalName || fallback).split(/[/\\]/).pop() || fallback;
  const cleaned = raw.replace(/[^\w.\-]+/g, '_').slice(0, 80);
  return cleaned || fallback;
}

function publicAssetUrl(url, req) {
  const raw = String(url || '').trim();
  if (!raw) return raw;
  if (!raw.startsWith('/uploads/')) return raw;
  const envBase = String(process.env.PUBLIC_API_BASE_URL || '').replace(/\/+$/, '');
  if (envBase) return `${envBase}${raw}`;
  const host = req?.get?.('host');
  if (host) {
    const proto = req.protocol || 'http';
    return `${proto}://${host}${raw}`;
  }
  return raw;
}

function toPublic(doc, req) {
  const row = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    _id: row._id,
    label: row.label || '',
    originalName: row.originalName || '',
    url: publicAssetUrl(row.url, req),
    contentType: row.contentType,
    size: row.size || 0,
    createdAt: row.createdAt,
  };
}

exports.listCreatives = async (req, res, next) => {
  try {
    const items = await BrandCreative.find().sort({createdAt: -1}).lean();
    res.json({
      success: true,
      data: {items: items.map((row) => toPublic(row, req))},
    });
  } catch (error) {
    next(error);
  }
};

exports.uploadCreative = async (req, res, next) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Choose an image (JPEG, PNG, or WebP).',
      });
    }
    const validated = validateImageBuffer(req.file.buffer, req.file.mimetype);
    if (validated.contentType === 'image/svg+xml') {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Use JPEG, PNG, or WebP for creatives.',
      });
    }
    const key = buildAdminCreativeKey(validated.extension);
    const uploaded = await s3.uploadFile({
      body: req.file.buffer,
      key,
      contentType: validated.contentType,
      userId: req.user?.uid,
    });
    const label = String(req.body?.label || '').trim().slice(0, 120);
    const originalName = String(req.file.originalname || '').slice(0, 200);
    const doc = await BrandCreative.create({
      _id: randomUUID(),
      label: label || originalName.replace(/\.[^.]+$/, ''),
      originalName,
      key: uploaded.key,
      url: uploaded.url,
      contentType: uploaded.contentType,
      size: uploaded.size,
      uploadedBy: req.user?.uid || '',
    });
    res.status(201).json({
      success: true,
      data: toPublic(doc, req),
      message: 'Image uploaded',
    });
  } catch (error) {
    next(error);
  }
};

exports.downloadCreative = async (req, res, next) => {
  try {
    const doc = await BrandCreative.findById(req.params.id).lean();
    if (!doc) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Image not found',
      });
    }
    const object = await s3.getObject(doc.key, {userId: req.user?.uid});
    const filename = safeDownloadName(doc.originalName || doc.label, '');
    res.setHeader('Content-Type', object.contentType || doc.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    if (object.contentLength) {
      res.setHeader('Content-Length', String(object.contentLength));
    }
    if (Buffer.isBuffer(object.body)) {
      res.send(object.body);
      return;
    }
    await pipeline(object.body, res);
  } catch (error) {
    next(error);
  }
};

exports.deleteCreative = async (req, res, next) => {
  try {
    const doc = await BrandCreative.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Image not found',
      });
    }
    try {
      await s3.deleteObject(doc.key, {userId: req.user?.uid});
    } catch {
      /* file may already be gone; still drop the catalog row */
    }
    await BrandCreative.deleteOne({_id: doc._id});
    res.json({success: true, data: {_id: doc._id}});
  } catch (error) {
    next(error);
  }
};
