/**
 * Akansho HR Employee — internal staff record (not a login User by default).
 * Salary history is append-only; employeeCode is system-generated and immutable.
 */

const mongoose = require('mongoose');

const EMPLOYMENT_TYPES = Object.freeze([
  'full_time',
  'part_time',
  'contract',
  'intern',
  'other',
]);

const EMPLOYEE_STATUSES = Object.freeze([
  'active',
  'on_leave',
  'inactive',
  'former',
]);

const DOCUMENT_TYPES = Object.freeze([
  'aadhaar',
  'pan',
  'address_proof',
  'joining_letter',
  'employment_agreement',
  'other',
]);

const compensationSchema = new mongoose.Schema(
  {
    amount: {type: Number, required: true, min: 0},
    currency: {type: String, default: 'INR', trim: true},
    salaryType: {
      type: String,
      enum: ['monthly', 'hourly', 'daily', 'annual'],
      default: 'monthly',
    },
    effectiveFrom: {type: Date, required: true},
    reason: {type: String, trim: true, default: ''},
    createdAt: {type: Date, default: Date.now},
    createdBy: {type: String, trim: true, default: ''},
    createdByName: {type: String, trim: true, default: ''},
  },
  {_id: true},
);

const documentSchema = new mongoose.Schema(
  {
    type: {type: String, enum: DOCUMENT_TYPES, required: true},
    label: {type: String, trim: true, default: ''},
    fileUrl: {type: String, trim: true, required: true},
    fileName: {type: String, trim: true, default: ''},
    contentType: {type: String, trim: true, default: ''},
    uploadedAt: {type: Date, default: Date.now},
    uploadedBy: {type: String, trim: true, default: ''},
    uploadedByName: {type: String, trim: true, default: ''},
  },
  {_id: true},
);

const activitySchema = new mongoose.Schema(
  {
    type: {type: String, required: true, trim: true},
    summary: {type: String, required: true, trim: true},
    detail: {type: String, trim: true, default: ''},
    createdAt: {type: Date, default: Date.now},
    createdBy: {type: String, trim: true, default: ''},
    createdByName: {type: String, trim: true, default: ''},
  },
  {_id: true},
);

const addressSchema = new mongoose.Schema(
  {
    line1: {type: String, trim: true, default: ''},
    line2: {type: String, trim: true, default: ''},
    city: {type: String, trim: true, default: ''},
    district: {type: String, trim: true, default: ''},
    state: {type: String, trim: true, default: ''},
    pincode: {type: String, trim: true, default: ''},
  },
  {_id: false},
);

const bankSchema = new mongoose.Schema(
  {
    accountNumber: {type: String, trim: true, default: ''},
    ifsc: {type: String, trim: true, default: ''},
    accountHolderName: {type: String, trim: true, default: ''},
    uan: {type: String, trim: true, default: ''},
    esi: {type: String, trim: true, default: ''},
  },
  {_id: false},
);

const employeeSchema = new mongoose.Schema(
  {
    employeeCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    fullName: {type: String, required: true, trim: true},
    phone: {type: String, required: true, trim: true, index: true},
    email: {type: String, trim: true, default: ''},
    photoUrl: {type: String, trim: true, default: ''},
    dateOfBirth: {type: Date},
    gender: {
      type: String,
      enum: ['male', 'female', 'other', ''],
      default: '',
    },
    address: {type: addressSchema, default: () => ({})},

    profession: {type: String, trim: true, default: ''},
    designation: {type: String, trim: true, default: ''},
    department: {type: String, trim: true, default: ''},
    employmentType: {
      type: String,
      enum: EMPLOYMENT_TYPES,
      default: 'full_time',
    },
    joiningDate: {type: Date},
    confirmationDate: {type: Date},
    professionalExperienceYears: {type: Number, min: 0, default: 0},
    workLocation: {type: String, trim: true, default: ''},
    reportingManagerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      default: null,
    },
    reportingManagerName: {type: String, trim: true, default: ''},
    reportingManagerCode: {type: String, trim: true, default: ''},

    status: {
      type: String,
      enum: EMPLOYEE_STATUSES,
      default: 'active',
      index: true,
    },
    leavingDate: {type: Date},
    leavingReason: {type: String, trim: true, default: ''},

    compensationHistory: {type: [compensationSchema], default: []},
    bank: {type: bankSchema, default: () => ({})},
    documents: {type: [documentSchema], default: []},
    activity: {type: [activitySchema], default: []},

    /** Opaque token for ID-card QR verification (no PII in QR payload). */
    verificationToken: {type: String, trim: true, unique: true, sparse: true},

    /**
     * Employee portal access (separate from Admin).
     * Activation: invite token → password → TOTP → ACTIVE.
     */
    linkedUserId: {type: String, trim: true, default: '', index: true},
    accountStatus: {
      type: String,
      enum: [
        'none',
        'invited',
        'activation_pending',
        'active',
        'suspended',
        'revoked',
      ],
      default: 'none',
      index: true,
    },
    profileAccess: {
      type: String,
      enum: ['view', 'edit'],
      default: 'view',
    },
    canRaiseRequest: {type: Boolean, default: false},
    inviteTokenHash: {type: String, trim: true, default: '', index: true},
    inviteExpiresAt: {type: Date},
    inviteSentAt: {type: Date},
    inviteAcceptedAt: {type: Date},
    /** Email/password + TOTP for employee portal (not Admin). */
    passwordHash: {type: String, default: ''},
    totpSecretEncrypted: {type: String, default: ''},
    totpEnabled: {type: Boolean, default: false},

    createdBy: {type: String, trim: true, default: ''},
    updatedBy: {type: String, trim: true, default: ''},
  },
  {timestamps: true},
);

employeeSchema.index({fullName: 'text', profession: 'text', designation: 'text', department: 'text'});

employeeSchema.methods.currentCompensation = function currentCompensation() {
  const list = Array.isArray(this.compensationHistory)
    ? [...this.compensationHistory]
    : [];
  if (!list.length) return null;
  list.sort((a, b) => {
    const ta = new Date(a.effectiveFrom || 0).getTime();
    const tb = new Date(b.effectiveFrom || 0).getTime();
    if (tb !== ta) return tb - ta;
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });
  return list[0];
};

employeeSchema.statics.EMPLOYMENT_TYPES = EMPLOYMENT_TYPES;
employeeSchema.statics.EMPLOYEE_STATUSES = EMPLOYEE_STATUSES;
employeeSchema.statics.DOCUMENT_TYPES = DOCUMENT_TYPES;

const Employee = mongoose.model('Employee', employeeSchema, 'employees');

module.exports = Employee;
