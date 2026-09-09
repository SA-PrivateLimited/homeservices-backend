/**
 * Admin HR — Employee management
 */

const crypto = require('crypto');
const QRCode = require('qrcode');
const Employee = require('../../models/Employee');
const {nextEmployeeCode} = require('../../utils/employeeCode');
const ADMIN_LIST_SORT = require('../../utils/adminListSort');
const {localTenDigits, toE164} = require('../../utils/phone');
const {hasPermission, PERMISSIONS} = require('../../constants/permissions');

function canSeeSalary(req) {
  if (req.isSuperAdmin) return true;
  return hasPermission(req.user, PERMISSIONS.EMPLOYEES_SALARY);
}

function actor(req) {
  const id = String(req.user?.uid || req.user?.id || req.user?._id || '').trim();
  const name = String(
    req.user?.name || req.user?.displayName || req.user?.email || 'Admin',
  ).trim();
  return {id, name};
}

function pushActivity(employee, type, summary, detail, who) {
  employee.activity = employee.activity || [];
  employee.activity.unshift({
    type,
    summary,
    detail: detail || '',
    createdAt: new Date(),
    createdBy: who.id,
    createdByName: who.name,
  });
  if (employee.activity.length > 200) {
    employee.activity = employee.activity.slice(0, 200);
  }
}

function parsePhone(raw) {
  const ten = localTenDigits(raw);
  if (ten.length !== 10) return null;
  return toE164(ten);
}

function maskAccount(num) {
  const digits = String(num || '').replace(/\D/g, '');
  if (digits.length < 4) return digits ? '••••' : '';
  return `•••• •••• ${digits.slice(-4)}`;
}

function sanitizeForClient(doc, {includeSalary} = {includeSalary: false}) {
  const o = typeof doc.toObject === 'function' ? doc.toObject() : {...doc};
  const current = (() => {
    const list = Array.isArray(o.compensationHistory)
      ? [...o.compensationHistory]
      : [];
    if (!list.length) return null;
    list.sort((a, b) => {
      const ta = new Date(a.effectiveFrom || 0).getTime();
      const tb = new Date(b.effectiveFrom || 0).getTime();
      if (tb !== ta) return tb - ta;
      return (
        new Date(b.createdAt || 0).getTime() -
        new Date(a.createdAt || 0).getTime()
      );
    });
    return list[0];
  })();

  const bank = o.bank || {};
  const result = {
    ...o,
    currentSalary: includeSalary && current
      ? {
          amount: current.amount,
          currency: current.currency || 'INR',
          salaryType: current.salaryType || 'monthly',
          effectiveFrom: current.effectiveFrom,
          reason: current.reason || '',
        }
      : includeSalary
        ? null
        : undefined,
    bank: includeSalary
      ? {
          ...bank,
          accountNumberMasked: maskAccount(bank.accountNumber),
          accountNumber: bank.accountNumber || '',
        }
      : undefined,
    compensationHistory: includeSalary ? o.compensationHistory || [] : undefined,
  };

  if (!includeSalary) {
    delete result.compensationHistory;
    delete result.bank;
    delete result.currentSalary;
  }

  return result;
}

function listProjection() {
  return {
    employeeCode: 1,
    fullName: 1,
    phone: 1,
    email: 1,
    photoUrl: 1,
    profession: 1,
    designation: 1,
    department: 1,
    employmentType: 1,
    joiningDate: 1,
    professionalExperienceYears: 1,
    workLocation: 1,
    status: 1,
    address: 1,
    reportingManagerName: 1,
    reportingManagerCode: 1,
    createdAt: 1,
    updatedAt: 1,
  };
}

/**
 * GET /api/admin/employees/stats
 */
exports.getEmployeeStats = async (req, res, next) => {
  try {
    const [total, active, onLeave, former, inactive] = await Promise.all([
      Employee.countDocuments({}),
      Employee.countDocuments({status: 'active'}),
      Employee.countDocuments({status: 'on_leave'}),
      Employee.countDocuments({status: 'former'}),
      Employee.countDocuments({status: 'inactive'}),
    ]);
    res.json({
      success: true,
      data: {total, active, onLeave, former, inactive},
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/employees
 */
exports.listEmployees = async (req, res, next) => {
  try {
    const {
      search = '',
      status,
      department,
      profession,
      employmentType,
      limit = 20,
      offset = 0,
    } = req.query;

    const query = {};
    if (status && status !== 'all') query.status = String(status);
    if (department && department !== 'all') {
      query.department = new RegExp(
        `^${escapeRegex(String(department).trim())}$`,
        'i',
      );
    }
    if (profession && profession !== 'all') {
      query.profession = new RegExp(
        `^${escapeRegex(String(profession).trim())}$`,
        'i',
      );
    }
    if (employmentType && employmentType !== 'all') {
      query.employmentType = String(employmentType);
    }

    const q = String(search || '').trim();
    if (q) {
      const ten = localTenDigits(q);
      const or = [
        {fullName: new RegExp(escapeRegex(q), 'i')},
        {employeeCode: new RegExp(escapeRegex(q), 'i')},
        {profession: new RegExp(escapeRegex(q), 'i')},
        {designation: new RegExp(escapeRegex(q), 'i')},
        {department: new RegExp(escapeRegex(q), 'i')},
        {workLocation: new RegExp(escapeRegex(q), 'i')},
      ];
      if (ten.length >= 4) {
        or.push({phone: new RegExp(escapeRegex(ten))});
      }
      query.$or = or;
    }

    const lim = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
    const off = Math.max(parseInt(offset, 10) || 0, 0);

    const [rows, total] = await Promise.all([
      Employee.find(query)
        .select(listProjection())
        .sort(ADMIN_LIST_SORT)
        .limit(lim)
        .skip(off)
        .lean(),
      Employee.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: rows,
      count: rows.length,
      total,
      limit: lim,
      offset: off,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/employees/meta — departments / professions for filters
 */
exports.getEmployeeMeta = async (req, res, next) => {
  try {
    const [departments, professions] = await Promise.all([
      Employee.distinct('department', {department: {$nin: [null, '']}}),
      Employee.distinct('profession', {profession: {$nin: [null, '']}}),
    ]);
    res.json({
      success: true,
      data: {
        departments: departments.filter(Boolean).sort(),
        professions: professions.filter(Boolean).sort(),
        employmentTypes: Employee.EMPLOYMENT_TYPES,
        statuses: Employee.EMPLOYEE_STATUSES,
        documentTypes: Employee.DOCUMENT_TYPES,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/employees/:id
 */
exports.getEmployee = async (req, res, next) => {
  try {
    const doc = await Employee.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Employee not found',
      });
    }
    const includeSalary = canSeeSalary(req);
    res.json({
      success: true,
      data: sanitizeForClient(doc, {includeSalary}),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/employees
 */
exports.createEmployee = async (req, res, next) => {
  try {
    const who = actor(req);
    const body = req.body || {};
    const fullName = String(body.fullName || '').trim();
    const phone = parsePhone(body.phone);
    if (!fullName) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Full name is required',
      });
    }
    if (!phone) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Please enter a valid 10-digit phone number',
      });
    }

    const existing = await Employee.findOne({phone});
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'Conflict',
        message: `An employee with this phone already exists (${existing.employeeCode})`,
      });
    }

    const employeeCode = await nextEmployeeCode();
    const verificationToken = crypto.randomBytes(24).toString('hex');

    let manager = null;
    if (body.reportingManagerId) {
      manager = await Employee.findById(body.reportingManagerId).lean();
    }

    const employee = new Employee({
      employeeCode,
      fullName,
      phone,
      email: String(body.email || '').trim(),
      photoUrl: String(body.photoUrl || '').trim(),
      dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : undefined,
      gender: body.gender || '',
      address: body.address || {},
      profession: String(body.profession || '').trim(),
      designation: String(body.designation || '').trim(),
      department: String(body.department || '').trim(),
      employmentType: body.employmentType || 'full_time',
      joiningDate: body.joiningDate ? new Date(body.joiningDate) : undefined,
      confirmationDate: body.confirmationDate
        ? new Date(body.confirmationDate)
        : undefined,
      professionalExperienceYears:
        body.professionalExperienceYears != null
          ? Number(body.professionalExperienceYears)
          : 0,
      workLocation: String(body.workLocation || '').trim(),
      reportingManagerId: manager?._id || null,
      reportingManagerName: manager?.fullName || '',
      reportingManagerCode: manager?.employeeCode || '',
      status: 'active',
      verificationToken,
      createdBy: who.id,
      updatedBy: who.id,
      activity: [],
      compensationHistory: [],
      documents: [],
    });

    pushActivity(employee, 'created', 'Employee created', '', who);

    if (
      body.initialSalary != null &&
      Number(body.initialSalary) > 0 &&
      canSeeSalary(req)
    ) {
      employee.compensationHistory.push({
        amount: Number(body.initialSalary),
        currency: 'INR',
        salaryType: body.salaryType || 'monthly',
        effectiveFrom: body.salaryEffectiveFrom
          ? new Date(body.salaryEffectiveFrom)
          : new Date(),
        reason: String(body.salaryReason || 'Initial salary').trim(),
        createdAt: new Date(),
        createdBy: who.id,
        createdByName: who.name,
      });
      pushActivity(
        employee,
        'salary_updated',
        'Initial salary set',
        `₹${Number(body.initialSalary).toLocaleString('en-IN')}`,
        who,
      );
    }

    if (body.bank && canSeeSalary(req)) {
      employee.bank = {
        accountNumber: String(body.bank.accountNumber || '').trim(),
        ifsc: String(body.bank.ifsc || '').trim(),
        accountHolderName: String(body.bank.accountHolderName || '').trim(),
        uan: String(body.bank.uan || '').trim(),
        esi: String(body.bank.esi || '').trim(),
      };
    }

    await employee.save();

    const includeSalary = canSeeSalary(req);
    res.status(201).json({
      success: true,
      data: sanitizeForClient(employee, {includeSalary}),
      message: 'Employee added successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/admin/employees/:id
 */
exports.updateEmployee = async (req, res, next) => {
  try {
    const who = actor(req);
    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Employee not found',
      });
    }

    const body = req.body || {};
    const changes = [];

    if (body.fullName != null) {
      const v = String(body.fullName).trim();
      if (!v) {
        return res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Full name is required',
        });
      }
      if (v !== employee.fullName) {
        changes.push('name');
        employee.fullName = v;
      }
    }

    if (body.phone != null) {
      const phone = parsePhone(body.phone);
      if (!phone) {
        return res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'Please enter a valid 10-digit phone number',
        });
      }
      if (phone !== employee.phone) {
        const dup = await Employee.findOne({
          phone,
          _id: {$ne: employee._id},
        }).lean();
        if (dup) {
          return res.status(409).json({
            success: false,
            error: 'Conflict',
            message: `Another employee already uses this phone (${dup.employeeCode})`,
          });
        }
        changes.push('phone');
        employee.phone = phone;
      }
    }

    const stringFields = [
      'email',
      'photoUrl',
      'profession',
      'designation',
      'department',
      'workLocation',
      'leavingReason',
    ];
    for (const f of stringFields) {
      if (body[f] != null) {
        const v = String(body[f]).trim();
        if (v !== employee[f]) {
          changes.push(f);
          employee[f] = v;
        }
      }
    }

    if (body.gender != null) employee.gender = body.gender || '';
    if (body.employmentType != null) {
      employee.employmentType = body.employmentType;
      changes.push('employmentType');
    }
    if (body.dateOfBirth !== undefined) {
      employee.dateOfBirth = body.dateOfBirth
        ? new Date(body.dateOfBirth)
        : undefined;
    }
    if (body.joiningDate !== undefined) {
      employee.joiningDate = body.joiningDate
        ? new Date(body.joiningDate)
        : undefined;
    }
    if (body.confirmationDate !== undefined) {
      employee.confirmationDate = body.confirmationDate
        ? new Date(body.confirmationDate)
        : undefined;
    }
    if (body.leavingDate !== undefined) {
      employee.leavingDate = body.leavingDate
        ? new Date(body.leavingDate)
        : undefined;
    }
    if (body.professionalExperienceYears != null) {
      employee.professionalExperienceYears = Number(
        body.professionalExperienceYears,
      );
    }
    if (body.address != null) {
      employee.address = {...(employee.address?.toObject?.() || employee.address || {}), ...body.address};
      changes.push('address');
    }

    if (body.reportingManagerId !== undefined) {
      if (!body.reportingManagerId) {
        employee.reportingManagerId = null;
        employee.reportingManagerName = '';
        employee.reportingManagerCode = '';
      } else {
        const manager = await Employee.findById(body.reportingManagerId).lean();
        if (!manager) {
          return res.status(400).json({
            success: false,
            error: 'Bad Request',
            message: 'Reporting manager not found',
          });
        }
        if (String(manager._id) === String(employee._id)) {
          return res.status(400).json({
            success: false,
            error: 'Bad Request',
            message: 'Employee cannot report to themselves',
          });
        }
        employee.reportingManagerId = manager._id;
        employee.reportingManagerName = manager.fullName;
        employee.reportingManagerCode = manager.employeeCode;
      }
      changes.push('reportingManager');
    }

    if (
      body.bank != null &&
      canSeeSalary(req)
    ) {
      employee.bank = {
        ...(employee.bank?.toObject?.() || employee.bank || {}),
        ...body.bank,
      };
      changes.push('bank');
    }

    employee.updatedBy = who.id;
    if (changes.length) {
      pushActivity(
        employee,
        'updated',
        'Employee details updated',
        changes.join(', '),
        who,
      );
    }

    await employee.save();
    const includeSalary = canSeeSalary(req);
    res.json({
      success: true,
      data: sanitizeForClient(employee, {includeSalary}),
      message: 'Employee details updated',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PATCH /api/admin/employees/:id/status
 */
exports.updateEmployeeStatus = async (req, res, next) => {
  try {
    const who = actor(req);
    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Employee not found',
      });
    }

    const status = String(req.body?.status || '').trim();
    if (!Employee.EMPLOYEE_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Invalid status',
      });
    }

    const prev = employee.status;
    employee.status = status;
    if (status === 'former') {
      employee.leavingDate = req.body.leavingDate
        ? new Date(req.body.leavingDate)
        : new Date();
      if (req.body.leavingReason != null) {
        employee.leavingReason = String(req.body.leavingReason).trim();
      }
    }
    employee.updatedBy = who.id;
    pushActivity(
      employee,
      'status_changed',
      'Status changed',
      `${prev} → ${status}`,
      who,
    );
    await employee.save();

    const includeSalary = canSeeSalary(req);
    res.json({
      success: true,
      data: sanitizeForClient(employee, {includeSalary}),
      message:
        status === 'former'
          ? 'Employee deactivated'
          : 'Employee status updated',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/employees/:id/compensation
 */
exports.addCompensation = async (req, res, next) => {
  try {
    const who = actor(req);
    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Employee not found',
      });
    }

    const amount = Number(req.body?.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Enter a valid salary amount',
      });
    }
    if (!req.body?.effectiveFrom) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Effective from date is required',
      });
    }

    const prev = employee.currentCompensation?.() || null;
    const entry = {
      amount,
      currency: 'INR',
      salaryType: req.body.salaryType || 'monthly',
      effectiveFrom: new Date(req.body.effectiveFrom),
      reason: String(req.body.reason || '').trim(),
      createdAt: new Date(),
      createdBy: who.id,
      createdByName: who.name,
    };
    employee.compensationHistory.push(entry);
    employee.updatedBy = who.id;

    const detail = prev
      ? `₹${Number(prev.amount).toLocaleString('en-IN')} → ₹${amount.toLocaleString('en-IN')}`
      : `₹${amount.toLocaleString('en-IN')}`;
    pushActivity(employee, 'salary_updated', 'Salary updated', detail, who);
    await employee.save();

    res.json({
      success: true,
      data: sanitizeForClient(employee, {includeSalary: true}),
      message: 'Salary updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/employees/:id/documents
 */
exports.addDocument = async (req, res, next) => {
  try {
    const who = actor(req);
    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Employee not found',
      });
    }

    const type = String(req.body?.type || '').trim();
    if (!Employee.DOCUMENT_TYPES.includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Invalid document type',
      });
    }

    const s3 = require('../../services/s3.service');
    const {validateImageBuffer, createHttpError} = require('../../utils/assetValidation');
    const {buildAdminAssetKey} = require('../../utils/s3Keys');

    if (!req.file?.buffer) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Document file is required (field: file)',
      });
    }

    let extension = '.bin';
    let contentType = req.file.mimetype || 'application/octet-stream';
    try {
      const validated = validateImageBuffer(req.file.buffer, req.file.mimetype);
      extension = validated.extension;
      contentType = validated.contentType;
    } catch {
      // Allow PDF / common docs when not an image
      const mime = String(req.file.mimetype || '');
      if (mime === 'application/pdf') {
        extension = '.pdf';
        contentType = 'application/pdf';
      } else if (
        mime.startsWith('image/') ||
        mime === 'application/msword' ||
        mime.includes('officedocument')
      ) {
        extension =
          mime.includes('png')
            ? '.png'
            : mime.includes('webp')
              ? '.webp'
              : mime.includes('word')
                ? '.doc'
                : '.bin';
      } else {
        throw createHttpError(
          400,
          'Unsupported file type. Upload an image or PDF.',
          'Bad Request',
        );
      }
    }

    const key = buildAdminAssetKey(
      `emp_${String(employee._id)}`,
      extension,
    );
    const uploaded = await s3.uploadFile({
      body: req.file.buffer,
      key,
      contentType,
      userId: who.id,
    });

    employee.documents.push({
      type,
      label: String(req.body.label || '').trim(),
      fileUrl: uploaded.url,
      fileName: req.file.originalname || '',
      contentType,
      uploadedAt: new Date(),
      uploadedBy: who.id,
      uploadedByName: who.name,
    });
    employee.updatedBy = who.id;
    pushActivity(
      employee,
      'document_uploaded',
      'Document uploaded',
      type,
      who,
    );
    await employee.save();

    res.status(201).json({
      success: true,
      data: sanitizeForClient(employee, {
        includeSalary: canSeeSalary(req),
      }),
      message: 'Document uploaded',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/admin/employees/:id/documents/:documentId
 */
exports.deleteDocument = async (req, res, next) => {
  try {
    const who = actor(req);
    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Employee not found',
      });
    }

    const docId = String(req.params.documentId);
    const before = employee.documents.length;
    employee.documents = employee.documents.filter(
      (d) => String(d._id) !== docId,
    );
    if (employee.documents.length === before) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Document not found',
      });
    }
    employee.updatedBy = who.id;
    pushActivity(
      employee,
      'document_deleted',
      'Document deleted',
      '',
      who,
    );
    await employee.save();

    res.json({
      success: true,
      data: sanitizeForClient(employee, {
        includeSalary: canSeeSalary(req),
      }),
      message: 'Document deleted',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/employees/:id/photo
 */
exports.uploadPhoto = async (req, res, next) => {
  try {
    const who = actor(req);
    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Employee not found',
      });
    }
    if (!req.file?.buffer) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Photo file is required (field: file)',
      });
    }

    const s3 = require('../../services/s3.service');
    const {validateImageBuffer} = require('../../utils/assetValidation');
    const {buildAdminAssetKey, keyFromUrlOrKey, normalizeObjectKey} = require('../../utils/s3Keys');

    const validated = validateImageBuffer(req.file.buffer, req.file.mimetype);
    const key = buildAdminAssetKey(
      `emp_${String(employee._id)}`,
      validated.extension,
    );
    const uploaded = await s3.uploadFile({
      body: req.file.buffer,
      key,
      contentType: validated.contentType,
      userId: who.id,
    });

    const previous = employee.photoUrl;
    employee.photoUrl = uploaded.url;
    employee.updatedBy = who.id;
    pushActivity(employee, 'updated', 'Profile photo updated', '', who);
    await employee.save();

    if (previous && previous !== uploaded.url) {
      try {
        const oldKey = keyFromUrlOrKey(previous);
        normalizeObjectKey(oldKey);
        await s3.deleteObject(oldKey, {userId: who.id});
      } catch {
        /* ignore */
      }
    }

    res.json({
      success: true,
      data: {
        photoUrl: uploaded.url,
        employee: sanitizeForClient(employee, {
          includeSalary: canSeeSalary(req),
        }),
      },
      message: 'Photo uploaded',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/employees/:id/id-card
 * Ensures verification token + returns print payload + QR data URL.
 */
exports.generateIdCard = async (req, res, next) => {
  try {
    const who = actor(req);
    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Employee not found',
      });
    }

    if (!employee.verificationToken) {
      employee.verificationToken = crypto.randomBytes(24).toString('hex');
    }

    const base =
      process.env.PUBLIC_API_BASE_URL ||
      process.env.API_PUBLIC_URL ||
      `${req.protocol}://${req.get('host')}`;
    const verifyUrl = `${String(base).replace(/\/$/, '')}/api/employees/verify/${employee.verificationToken}`;

    const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
      margin: 1,
      width: 256,
      errorCorrectionLevel: 'M',
    });

    pushActivity(
      employee,
      'id_card_generated',
      'ID card generated',
      '',
      who,
    );
    employee.updatedBy = who.id;
    await employee.save();

    const addr = employee.address || {};
    const locationParts = [
      employee.workLocation,
      addr.city,
      addr.district,
      addr.state,
    ].filter(Boolean);

    res.json({
      success: true,
      data: {
        employeeCode: employee.employeeCode,
        fullName: employee.fullName,
        profession: employee.profession || employee.designation || '',
        designation: employee.designation || '',
        photoUrl: employee.photoUrl || '',
        phone: employee.phone,
        experienceYears: employee.professionalExperienceYears || 0,
        location: locationParts.join(', ') || employee.workLocation || '',
        status: employee.status,
        verificationUrl: verifyUrl,
        qrDataUrl,
        generatedAt: new Date().toISOString(),
      },
      message: 'Employee ID card generated',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/admin/employees/:id — hard delete (restricted)
 */
exports.deleteEmployee = async (req, res, next) => {
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Employee not found',
      });
    }
    await Employee.deleteOne({_id: employee._id});
    res.json({
      success: true,
      message: 'Employee permanently deleted',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/employees/verify/:token — public, minimal identity only
 */
exports.verifyEmployeePublic = async (req, res, next) => {
  try {
    const token = String(req.params.token || '').trim();
    if (!token || token.length < 16) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Invalid verification reference',
      });
    }
    const employee = await Employee.findOne({verificationToken: token})
      .select(
        'employeeCode fullName profession designation photoUrl status workLocation',
      )
      .lean();
    if (!employee) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Employee verification not found',
      });
    }
    res.json({
      success: true,
      data: {
        employeeCode: employee.employeeCode,
        fullName: employee.fullName,
        profession: employee.profession || employee.designation || '',
        photoUrl: employee.photoUrl || '',
        status: employee.status,
        workLocation: employee.workLocation || '',
        organization: 'Akanso',
      },
    });
  } catch (error) {
    next(error);
  }
};

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
