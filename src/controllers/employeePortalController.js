/**
 * Authenticated Employee Portal APIs — self-scoped only.
 */

const path = require('path');
const fs = require('fs');
const {
  publicEmployeeAccount,
} = require('../services/employeeInviteService');
const {keyFromUrlOrKey} = require('../utils/s3Keys');
const s3 = require('../services/s3.service');
const {UPLOAD_ROOT} = require('../middleware/upload');

function supportEmail() {
  return (
    String(process.env.SUPPORT_EMAIL || '').trim() || 'support@akansho.com'
  );
}

function sanitizeSelf(employee) {
  const raw = publicEmployeeAccount(employee);
  // Never expose secrets
  delete raw.passwordHash;
  delete raw.totpSecretEncrypted;
  delete raw.inviteTokenHash;
  delete raw.verificationToken;

  // Documents: hide direct storage URLs — use access endpoint
  const docs = Array.isArray(raw.documents) ? raw.documents : [];
  raw.documents = docs.map((d) => ({
    _id: d._id,
    type: d.type,
    label: d.label || '',
    fileName: d.fileName || '',
    contentType: d.contentType || '',
    uploadedAt: d.uploadedAt,
  }));

  // Bank: mask account
  if (raw.bank && raw.bank.accountNumber) {
    const n = String(raw.bank.accountNumber);
    raw.bank = {
      ...raw.bank,
      accountNumberMasked:
        n.length > 4 ? `${'*'.repeat(Math.max(0, n.length - 4))}${n.slice(-4)}` : '****',
      accountNumber: undefined,
    };
  }

  return raw;
}

/** GET /api/employee/me */
exports.getMyProfile = async (req, res, next) => {
  try {
    const employee = req.employee;
    const current =
      typeof employee.currentCompensation === 'function'
        ? employee.currentCompensation()
        : null;
    res.json({
      success: true,
      data: {
        employee: sanitizeSelf(employee),
        currentCompensation: current
          ? {
              amount: current.amount,
              currency: current.currency || 'INR',
              salaryType: current.salaryType || 'monthly',
              effectiveFrom: current.effectiveFrom,
            }
          : null,
        capabilities: {
          profileAccess: employee.profileAccess || 'view',
          canRaiseRequest: Boolean(employee.canRaiseRequest),
          canViewCompensation: true,
          canViewDocuments: true,
          canViewIdCard: true,
        },
        supportEmail: supportEmail(),
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/employee/me/documents/:documentId/access
 * Returns a short-lived access URL for the employee's own document.
 */
exports.getMyDocumentAccess = async (req, res, next) => {
  try {
    const employee = req.employee;
    const documentId = String(req.params.documentId || '').trim();
    const doc = (employee.documents || []).id
      ? employee.documents.id(documentId)
      : (employee.documents || []).find((d) => String(d._id) === documentId);

    if (!doc) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Document not found',
      });
    }

    const keySource = doc.fileKey || doc.fileUrl;
    if (!keySource) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Document file is unavailable',
      });
    }

    let key;
    try {
      key = keyFromUrlOrKey(keySource);
    } catch {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Document file is unavailable',
      });
    }

    // Only allow keys belonging to this employee folder pattern
    const empPrefix = `admin/emp_${String(employee._id)}/`;
    const empPrefixAlt = `employees/${String(employee._id)}/`;
    if (!key.startsWith(empPrefix) && !key.startsWith(empPrefixAlt)) {
      // Backward compatible: allow if stored URL was previously issued for this doc
      if (!doc.fileUrl || !String(doc.fileUrl).includes(String(employee._id))) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'Not allowed to access this document',
        });
      }
    }

    const expiresIn = 300;
    if (s3.localDiskAllowed && s3.localDiskAllowed()) {
      const absPath = path.join(UPLOAD_ROOT, key);
      if (!fs.existsSync(absPath)) {
        return res.status(404).json({
          success: false,
          error: 'Not Found',
          message: 'Document file is unavailable',
        });
      }
      const base =
        process.env.PUBLIC_API_BASE_URL ||
        `${req.protocol}://${req.get('host')}`;
      return res.json({
        success: true,
        data: {
          url: `${String(base).replace(/\/$/, '')}/uploads/${key}`,
          contentType: doc.contentType || 'application/octet-stream',
          fileName: doc.fileName || '',
          expiresIn,
        },
      });
    }

    const url = await s3.createPresignedGetUrl({
      key,
      expiresIn,
      userId: String(employee._id),
    });

    res.json({
      success: true,
      data: {
        url,
        contentType: doc.contentType || 'application/octet-stream',
        fileName: doc.fileName || '',
        expiresIn,
      },
    });
  } catch (error) {
    next(error);
  }
};
