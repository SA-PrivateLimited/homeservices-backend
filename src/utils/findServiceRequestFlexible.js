/**
 * ServiceRequest _id may be a string (Firestore-style) or a native ObjectId
 * (older / mixed inserts). Mongoose String casting makes ObjectId docs
 * invisible to normal findOne — use this helper instead.
 */

const mongoose = require('mongoose');
const ServiceRequest = require('../models/ServiceRequest');
const {getCollection, connectDB} = require('../config/database');

function isHexObjectId(id) {
  const s = String(id || '').trim();
  return (
    mongoose.Types.ObjectId.isValid(s) &&
    String(new mongoose.Types.ObjectId(s)) === s
  );
}

/**
 * Persist updates for mixed _id types safely.
 */
async function saveServiceRequestFlexible(doc) {
  if (!doc) return null;
  const id = doc._id;
  try {
    await doc.save();
    return doc;
  } catch (err) {
    await connectDB();
    const col = await getCollection('serviceRequests');
    const payload = doc.toObject ? doc.toObject() : {...doc};
    delete payload._id;
    await col.updateOne({_id: id}, {$set: payload});
    return doc;
  }
}

async function hydrateServiceRequest(raw) {
  if (!raw) return null;
  const asString = String(raw._id);
  const existing = await ServiceRequest.findOne({_id: asString});
  if (existing) return existing;

  const hydrated = ServiceRequest.hydrate({
    ...raw,
    _id: raw._id,
  });
  hydrated.isNew = false;
  return hydrated;
}

/**
 * @param {string} serviceRequestId
 * @param {{status?: string|null}} [options] — if status set, prefer that status first
 * @returns {Promise<import('mongoose').Document|null>}
 */
async function findServiceRequestFlexible(serviceRequestId, options = {}) {
  const cleaned = String(serviceRequestId || '').trim();
  if (!cleaned) return null;

  const status = options.status;

  // 1) Direct mongoose match (works for string ids; Mixed also allows ObjectId after cast)
  let doc = await ServiceRequest.findOne({_id: cleaned});
  if (doc && (!status || doc.status === status)) return doc;

  if (isHexObjectId(cleaned)) {
    doc = await ServiceRequest.findOne({
      _id: new mongoose.Types.ObjectId(cleaned),
    });
    if (doc && (!status || doc.status === status)) return doc;
  }

  // 2) Native collection — ObjectId and string, plus legacy fields
  await connectDB();
  const col = await getCollection('serviceRequests');
  const or = [
    {_id: cleaned},
    {consultationId: cleaned},
    {id: cleaned},
    {bookingId: cleaned},
  ];
  if (isHexObjectId(cleaned)) {
    or.unshift({_id: new mongoose.Types.ObjectId(cleaned)});
  }

  if (status) {
    const withStatus = await col.findOne({$and: [{$or: or}, {status}]});
    if (withStatus) return hydrateServiceRequest(withStatus);
  }

  const raw = await col.findOne({$or: or});
  if (!raw) return null;
  return hydrateServiceRequest(raw);
}

module.exports = {
  isHexObjectId,
  findServiceRequestFlexible,
  saveServiceRequestFlexible,
};
