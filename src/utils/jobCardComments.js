/**
 * Shared job-card comment helpers
 */

const JobCard = require('../models/JobCard');
const User = require('../models/User');
const {
  isJobCardCommentsEnabled,
} = require('../services/jobCardCommentsPolicyService');

async function resolveAuthorName(req, fallback) {
  if (req.user?.name) return req.user.name;
  if (req.user?.displayName) return req.user.displayName;
  try {
    const user = await User.findById(req.user?.uid).select('name displayName').lean();
    return user?.name || user?.displayName || fallback;
  } catch {
    return fallback;
  }
}

/**
 * @param {'admin'|'provider'|'customer'} role
 */
async function addJobCardComment({jobCardId, role, req, text}) {
  if (role !== 'admin') {
    const enabled = await isJobCardCommentsEnabled();
    if (!enabled) {
      const err = new Error(
        'Job chat is currently disabled by the administrator',
      );
      err.status = 403;
      throw err;
    }
  }

  const trimmed = String(text || '').trim();
  if (!trimmed) {
    const err = new Error('Comment text is required');
    err.status = 400;
    throw err;
  }

  const jobCard = await JobCard.findById(jobCardId);
  if (!jobCard) {
    const err = new Error('Job card not found');
    err.status = 404;
    throw err;
  }

  const uid = String(req.user?.uid || '');
  if (role === 'provider' && String(jobCard.providerId || '') !== uid) {
    const err = new Error('You do not own this job card');
    err.status = 403;
    throw err;
  }
  if (role === 'customer' && String(jobCard.customerId || '') !== uid) {
    const err = new Error('You do not own this job card');
    err.status = 403;
    throw err;
  }

  const fallback =
    role === 'admin' ? 'Admin' : role === 'provider' ? 'Provider' : 'Customer';
  const authorName = await resolveAuthorName(req, fallback);

  const comment = {
    _id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    role,
    authorId: uid,
    authorName,
    text: trimmed,
    createdAt: new Date(),
  };

  if (!Array.isArray(jobCard.comments)) {
    jobCard.comments = [];
  }
  jobCard.comments.push(comment);
  jobCard.updatedAt = new Date();
  await jobCard.save({validateBeforeSave: false});

  return jobCard;
}

module.exports = {
  addJobCardComment,
};
