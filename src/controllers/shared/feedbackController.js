/**
 * User feedback — public create + admin list/update.
 */

const UserFeedback = require('../../models/UserFeedback');
const ADMIN_LIST_SORT = require('../../utils/adminListSort');

const ALLOWED_SOURCES = new Set([
  'partner_login',
  'partner_app',
  'customer_login',
  'customer_app',
  'other',
]);
const ALLOWED_APPS = new Set(['partner', 'customer', 'unknown']);
const ALLOWED_STATUSES = new Set(['new', 'read', 'resolved', 'archived']);

/**
 * POST /api/feedback
 * Public (optional auth). Stores suggestion for AdminWeb.
 */
exports.createFeedback = async (req, res, next) => {
  try {
    const userRole = req.user?.role || null;
    if (userRole === 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'Admins cannot submit feedback via this route',
      });
    }

    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (message.length < 5) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Please write a bit more so we can help.',
      });
    }
    if (message.length > 4000) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Feedback is too long.',
      });
    }

    let phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
    phone = phone.replace(/\D/g, '').slice(-10);

    let source =
      typeof req.body?.source === 'string' ? req.body.source.trim() : 'other';
    if (!ALLOWED_SOURCES.has(source)) source = 'other';

    let app = typeof req.body?.app === 'string' ? req.body.app.trim() : 'unknown';
    if (!ALLOWED_APPS.has(app)) app = 'unknown';

    const submittedByRole = req.user?.role
      ? req.user.role === 'provider'
        ? 'provider'
        : req.user.role === 'customer'
          ? 'customer'
          : 'anonymous'
      : 'anonymous';

    const now = new Date();
    const doc = await UserFeedback.create({
      message,
      phone,
      source,
      app,
      submittedBy: req.user?.uid || null,
      submittedByRole,
      status: 'new',
      userAgent: String(req.headers['user-agent'] || '').slice(0, 400),
      createdAt: now,
      updatedAt: now,
    });

    return res.status(201).json({
      success: true,
      data: {
        id: doc._id,
        status: doc.status,
        createdAt: doc.createdAt,
      },
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/feedback — admin list
 */
exports.listFeedback = async (req, res, next) => {
  try {
    const query = {};
    if (req.query.status && ALLOWED_STATUSES.has(String(req.query.status))) {
      query.status = String(req.query.status);
    }
    if (req.query.app && ALLOWED_APPS.has(String(req.query.app))) {
      query.app = String(req.query.app);
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
    const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0);

    const [rows, total] = await Promise.all([
      UserFeedback.find(query)
        .sort(ADMIN_LIST_SORT)
        .skip(skip)
        .limit(limit)
        .lean(),
      UserFeedback.countDocuments(query),
    ]);

    return res.json({
      success: true,
      data: rows,
      count: rows.length,
      total,
    });
  } catch (err) {
    return next(err);
  }
};

/**
 * PUT /api/feedback/:id — admin update status / notes
 */
exports.updateFeedback = async (req, res, next) => {
  try {
    const {id} = req.params;
    const doc = await UserFeedback.findById(id);
    if (!doc) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Feedback not found',
      });
    }

    if (req.body?.status != null) {
      const status = String(req.body.status);
      if (!ALLOWED_STATUSES.has(status)) {
        return res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'Invalid status',
        });
      }
      doc.status = status;
    }

    if (typeof req.body?.adminNotes === 'string') {
      doc.adminNotes = req.body.adminNotes.trim().slice(0, 2000);
    }

    doc.updatedAt = new Date();
    await doc.save();

    return res.json({success: true, data: doc});
  } catch (err) {
    return next(err);
  }
};
