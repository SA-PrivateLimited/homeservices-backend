const {EJSON} = require('mongoose').mongo.BSON;
const {getDB} = require('../../config/database');
const {
  RESTORE_CONFIRM_PHRASE,
  summarizeDatabase,
  buildBackupPayload,
  parseBackupPayload,
  restoreBackupPayload,
  backupFileName,
  parseCollectionNames,
} = require('../../utils/mongoBackup');

function actor(req) {
  const doc = req.userDoc || {};
  const email =
    req.user?.email || req.superAdmin?.email || doc.email || '';
  const name =
    doc.name ||
    doc.displayName ||
    [doc.firstName, doc.lastName].filter(Boolean).join(' ').trim() ||
    '';
  const phone = req.user?.phoneNumber || doc.phoneNumber || doc.phone || '';
  return {
    uid: req.user?.uid || req.superAdmin?.uid || '',
    email: String(email || '').trim(),
    name: String(name || '').trim(),
    phone: String(phone || '').trim(),
  };
}

function actorLabel(who) {
  return who.name || who.email || who.phone || who.uid || 'Admin';
}

async function recordEvent(db, type, extra) {
  try {
    await db.collection('admin_backup_events').insertOne({
      type,
      at: new Date(),
      ...extra,
    });
  } catch {
    // Audit must not block backup/restore.
  }
}

async function listBackupEvents(db, limit = 80) {
  const rows = await db
    .collection('admin_backup_events')
    .find({})
    .sort({at: -1})
    .limit(limit)
    .toArray();
  return rows.map((row) => ({
    id: String(row._id),
    type: row.type === 'restore' ? 'restore' : 'export',
    at: row.at instanceof Date ? row.at.toISOString() : row.at,
    adminId: row.adminId || '',
    adminName: row.adminName || '',
    adminEmail: row.adminEmail || '',
    adminPhone: row.adminPhone || '',
    collectionCount: row.collectionCount || row.restoredCollections || 0,
    documentCount: row.documentCount || 0,
    collections: Array.isArray(row.collections) ? row.collections : [],
  }));
}

exports.getBackupSummary = async (req, res, next) => {
  try {
    const db = getDB();
    const summary = await summarizeDatabase(db);
    const events = await listBackupEvents(db);
    res.json({
      success: true,
      data: {
        ...summary,
        restoreConfirmPhrase: RESTORE_CONFIRM_PHRASE,
        events,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.exportBackup = async (req, res, next) => {
  try {
    const db = getDB();
    const who = actor(req);
    const collectionNames = parseCollectionNames(req.query.collections);
    const payload = await buildBackupPayload(db, {exportedBy: who}, {
      collectionNames,
    });
    const body = EJSON.stringify(payload, {relaxed: false});
    const filename = backupFileName(
      payload.exportedAt,
      collectionNames.length ? collectionNames : undefined,
    );
    await recordEvent(db, 'export', {
      adminId: who.uid,
      adminName: actorLabel(who),
      adminEmail: who.email,
      adminPhone: who.phone,
      collectionCount: payload.collectionCount,
      documentCount: payload.documentCount,
      collections: Object.keys(payload.collections || {}),
    });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(body);
  } catch (error) {
    next(error);
  }
};

exports.restoreBackup = async (req, res, next) => {
  try {
    const file = req.file;
    if (!file || !file.buffer) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Choose an Akanso backup JSON file.',
      });
    }
    const payload = parseBackupPayload(file.buffer);
    const db = getDB();
    const who = actor(req);
    const collectionNames = parseCollectionNames(req.body?.collections);
    const result = await restoreBackupPayload(db, payload, req.body?.confirm, {
      collectionNames,
    });
    await recordEvent(db, 'restore', {
      adminId: who.uid,
      adminName: actorLabel(who),
      adminEmail: who.email,
      adminPhone: who.phone,
      sourceExportedAt: payload.exportedAt,
      restoredCollections: result.restoredCollections,
      collectionCount: result.restoredCollections,
      collections: result.collections.map((c) => c.name),
    });
    res.json({
      success: true,
      data: result,
      message: collectionNames.length
        ? 'Selected collections were updated from the backup file.'
        : 'Database collections in the backup file were restored.',
    });
  } catch (error) {
    next(error);
  }
};
