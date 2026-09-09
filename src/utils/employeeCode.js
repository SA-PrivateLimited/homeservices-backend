/**
 * Simple counter for system-generated employee codes (AK-EMP-00001…).
 */

const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  _id: {type: String, required: true},
  seq: {type: Number, default: 0},
});

const Counter = mongoose.model('Counter', counterSchema, 'counters');

async function nextEmployeeCode() {
  const doc = await Counter.findByIdAndUpdate(
    'employee_code',
    {$inc: {seq: 1}},
    {upsert: true, new: true, setDefaultsOnInsert: true},
  );
  const n = Number(doc.seq) || 1;
  return `AK-EMP-${String(n).padStart(5, '0')}`;
}

module.exports = {Counter, nextEmployeeCode};
