/**
 * Unit tests for employee JWT subject parsing and public verify shape helpers.
 */

const {test} = require('node:test');
const assert = require('node:assert/strict');
const {
  parseEmployeeIdFromSub,
} = require('../src/utils/employeeAuthSubject');

test('parseEmployeeIdFromSub reads employee: prefix', () => {
  assert.equal(
    parseEmployeeIdFromSub('employee:507f1f77bcf86cd799439011'),
    '507f1f77bcf86cd799439011',
  );
});

test('parseEmployeeIdFromSub rejects empty and non-employee subjects', () => {
  assert.equal(parseEmployeeIdFromSub(''), null);
  assert.equal(parseEmployeeIdFromSub('admin:123'), null);
  assert.equal(parseEmployeeIdFromSub(undefined), null);
});

test('parseEmployeeIdFromSub accepts bare ObjectId', () => {
  assert.equal(
    parseEmployeeIdFromSub('507f1f77bcf86cd799439011'),
    '507f1f77bcf86cd799439011',
  );
});
