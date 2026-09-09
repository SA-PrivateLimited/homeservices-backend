/**
 * HR lookup values — departments, designations, professions for dropdowns.
 */

const mongoose = require('mongoose');

const KINDS = Object.freeze(['department', 'designation', 'profession']);

const employeeLookupSchema = new mongoose.Schema(
  {
    kind: {type: String, enum: KINDS, required: true, index: true},
    label: {type: String, required: true, trim: true},
    createdBy: {type: String, trim: true, default: ''},
  },
  {timestamps: true},
);

employeeLookupSchema.index({kind: 1, label: 1}, {unique: true});

employeeLookupSchema.statics.KINDS = KINDS;

const EmployeeLookup = mongoose.model(
  'EmployeeLookup',
  employeeLookupSchema,
  'employee_lookups',
);

module.exports = EmployeeLookup;
