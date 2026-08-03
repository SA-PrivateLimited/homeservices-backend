/**
 * Canonical phone helpers for India-first marketplace.
 * Storage: phoneNumber = E.164 (+91…), phone = last 10 digits.
 */

function normalizePhone(phone) {
  return (phone || '').trim().replace(/[\s\-()]/g, '');
}

function toE164(phone, defaultCountryCode = '+91') {
  let cleaned = normalizePhone(phone);
  if (!cleaned) return '';
  if (cleaned.startsWith('00')) cleaned = `+${cleaned.slice(2)}`;
  if (!cleaned.startsWith('+')) {
    if (cleaned.length === 10) {
      cleaned = `${defaultCountryCode}${cleaned}`;
    } else {
      cleaned = `+${cleaned}`;
    }
  }
  return cleaned;
}

function localTenDigits(phone) {
  const digits = normalizePhone(phone).replace(/\D/g, '');
  if (digits.length >= 10) return digits.slice(-10);
  return digits;
}

/** Sync dual User fields from any phone input. */
function syncPhoneFields(input) {
  const ten = localTenDigits(input);
  if (!ten) {
    return {phone: '', phoneNumber: ''};
  }
  return {
    phone: ten,
    phoneNumber: toE164(ten),
  };
}

/** Display: +91 98765 43210 */
function formatPhoneDisplay(input) {
  if (!input) return '';
  const e164 = toE164(input);
  const ten = localTenDigits(e164);
  if (ten.length !== 10) return e164 || String(input);
  const cc = e164.startsWith('+')
    ? e164.slice(0, e164.length - 10)
    : '+91';
  return `${cc} ${ten.slice(0, 5)} ${ten.slice(5)}`;
}

module.exports = {
  normalizePhone,
  toE164,
  localTenDigits,
  syncPhoneFields,
  formatPhoneDisplay,
};
