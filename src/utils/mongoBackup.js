/**
 * Super Admin MongoDB snapshot for disaster recovery.
 * Documents are stored as Canonical Extended JSON so dates and ObjectIds round-trip.
 */

const {EJSON} = require('mongoose').mongo.BSON;

const BACKUP_FORMAT = 'akanso-mongo-backup-v1';
const RESTORE_CONFIRM_PHRASE = 'RESTORE';
const MAX_TOTAL_DOCUMENTS = 250000;

const SAFE_COLLECTION_RE = /^[a-zA-Z][a-zA-Z0-9_-]{0,127}$/;

function shouldSkipCollection(name) {
  const n = String(name || '');
  return !n || n.startsWith('system.') || n === 'admin_backup_events';
}

function parseCollectionNames(input) {
  if (input == null || input === '') return [];
  const raw = Array.isArray(input)
    ? input
    : String(input)
        .split(',')
        .map((part) => part.trim());
  const names = [...new Set(raw.map((n) => String(n || '').trim()).filter(Boolean))];
  for (const name of names) {
    if (shouldSkipCollection(name) || !SAFE_COLLECTION_RE.test(name)) {
      const err = new Error(`Invalid collection name: ${name}`);
      err.statusCode = 400;
      throw err;
    }
  }
  return names;
}

async function resolveExportNames(db, requested) {
  const available = await listUserCollections(db);
  if (!requested.length) return available;
  const missing = requested.filter((name) => !available.includes(name));
  if (missing.length) {
    const err = new Error(`Unknown collection: ${missing.join(', ')}`);
    err.statusCode = 404;
    throw err;
  }
  return requested;
}

function serializeIndexes(indexes) {
  return (indexes || [])
    .filter((idx) => idx && idx.name !== '_id_')
    .map((idx) => ({
      key: idx.key,
      name: idx.name,
      unique: idx.unique || false,
      sparse: idx.sparse || false,
      expireAfterSeconds: idx.expireAfterSeconds,
    }));
}

async function listUserCollections(db) {
  const listed = await db.listCollections({}, {nameOnly: true}).toArray();
  return listed
    .map((c) => c.name)
    .filter((name) => !shouldSkipCollection(name))
    .sort();
}

async function summarizeDatabase(db) {
  const names = await listUserCollections(db);
  const collections = [];
  let documentCount = 0;
  for (const name of names) {
    const count = await db.collection(name).estimatedDocumentCount();
    documentCount += count;
    collections.push({name, documentCount: count});
  }
  return {
    database: db.databaseName,
    collectionCount: collections.length,
    documentCount,
    collections,
  };
}

async function buildBackupPayload(db, meta, options = {}) {
  const requested = parseCollectionNames(options.collectionNames);
  const names = await resolveExportNames(db, requested);
  const collections = {};
  let documentCount = 0;

  for (const name of names) {
    const col = db.collection(name);
    const count = await col.estimatedDocumentCount();
    documentCount += count;
    if (documentCount > MAX_TOTAL_DOCUMENTS) {
      const err = new Error(
        `Backup is too large (over ${MAX_TOTAL_DOCUMENTS} documents). Use server mongodump instead.`,
      );
      err.statusCode = 413;
      throw err;
    }
    const documents = await col.find({}).toArray();
    const indexes = serializeIndexes(await col.indexes());
    collections[name] = {indexes, documents};
  }

  return {
    format: BACKUP_FORMAT,
    exportedAt: new Date().toISOString(),
    database: db.databaseName,
    exportedBy: meta.exportedBy || null,
    collectionCount: names.length,
    documentCount,
    collections,
  };
}

function parseBackupPayload(raw) {
  const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw || '');
  let parsed;
  try {
    parsed = EJSON.parse(text, {relaxed: false});
  } catch {
    const err = new Error('Backup file is not valid JSON.');
    err.statusCode = 400;
    throw err;
  }
  if (!parsed || parsed.format !== BACKUP_FORMAT || !parsed.collections) {
    const err = new Error(
      'This file is not an Akanso database backup. Download a fresh backup from this page.',
    );
    err.statusCode = 400;
    throw err;
  }
  return parsed;
}

async function restoreBackupPayload(db, payload, confirmPhrase, options = {}) {
  if (String(confirmPhrase || '').trim() !== RESTORE_CONFIRM_PHRASE) {
    const err = new Error(
      `Type ${RESTORE_CONFIRM_PHRASE} to confirm. This replaces matching collections in this database.`,
    );
    err.statusCode = 400;
    throw err;
  }

  let names = Object.keys(payload.collections || {}).filter(
    (name) => !shouldSkipCollection(name),
  );
  const requested = parseCollectionNames(options.collectionNames);
  if (requested.length) {
    names = requested.filter((name) => names.includes(name));
    if (!names.length) {
      const err = new Error(
        'This backup file does not contain the selected collections.',
      );
      err.statusCode = 400;
      throw err;
    }
  }
  const restored = [];

  for (const name of names) {
    const entry = payload.collections[name] || {};
    const documents = Array.isArray(entry.documents) ? entry.documents : [];
    const col = db.collection(name);
    await col.deleteMany({});
    if (documents.length) {
      await col.insertMany(documents, {ordered: false});
    }
    const indexes = serializeIndexes(entry.indexes);
    for (const idx of indexes) {
      if (!idx.key || !idx.name) continue;
      const opts = {name: idx.name};
      if (idx.unique) opts.unique = true;
      if (idx.sparse) opts.sparse = true;
      if (idx.expireAfterSeconds != null) {
        opts.expireAfterSeconds = idx.expireAfterSeconds;
      }
      try {
        await col.createIndex(idx.key, opts);
      } catch {
        // Index may already exist with a different name.
      }
    }
    restored.push({name, documentCount: documents.length});
  }

  return {
    database: db.databaseName,
    restoredCollections: restored.length,
    collections: restored,
  };
}

function backupFileName(exportedAt, collectionNames) {
  const stamp = String(exportedAt || new Date().toISOString()).replace(
    /[:.]/g,
    '-',
  );
  if (Array.isArray(collectionNames) && collectionNames.length === 1) {
    return `akanso-${collectionNames[0]}-${stamp}.json`;
  }
  if (Array.isArray(collectionNames) && collectionNames.length > 1) {
    return `akanso-${collectionNames.length}-collections-${stamp}.json`;
  }
  return `akanso-db-backup-${stamp}.json`;
}

module.exports = {
  BACKUP_FORMAT,
  RESTORE_CONFIRM_PHRASE,
  MAX_TOTAL_DOCUMENTS,
  shouldSkipCollection,
  parseCollectionNames,
  serializeIndexes,
  listUserCollections,
  summarizeDatabase,
  buildBackupPayload,
  parseBackupPayload,
  restoreBackupPayload,
  backupFileName,
};
