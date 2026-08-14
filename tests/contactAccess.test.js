/**
 * Unit tests for protected contact redaction helpers.
 * Run: npm test
 */

const {describe, it} = require('node:test');
const assert = require('node:assert/strict');

const {
  statusAllowsContact,
  canAccessProviderContact,
  canAccessCustomerContact,
  toPublicProvider,
  redactServiceRequestForViewer,
} = require('../src/utils/contactAccess');

describe('statusAllowsContact', () => {
  it('allows accepted / in-progress / completed', () => {
    assert.equal(statusAllowsContact('accepted'), true);
    assert.equal(statusAllowsContact('in-progress'), true);
    assert.equal(statusAllowsContact('in_progress'), true);
    assert.equal(statusAllowsContact('inprogress'), true);
    assert.equal(statusAllowsContact('completed'), true);
  });

  it('denies pending / cancelled / rejected', () => {
    assert.equal(statusAllowsContact('pending'), false);
    assert.equal(statusAllowsContact('cancelled'), false);
    assert.equal(statusAllowsContact('canceled'), false);
    assert.equal(statusAllowsContact('rejected'), false);
    assert.equal(statusAllowsContact(''), false);
    assert.equal(statusAllowsContact(undefined), false);
  });
});

describe('canAccessProviderContact', () => {
  const sr = {
    customerId: 'cust-1',
    providerId: 'prov-1',
    status: 'pending',
    providerPhone: '9000000001',
  };

  it('denies guest / unauthenticated', () => {
    assert.equal(canAccessProviderContact(null, sr), false);
    assert.equal(canAccessProviderContact({}, sr), false);
  });

  it('denies owning customer while pending', () => {
    assert.equal(
      canAccessProviderContact({uid: 'cust-1', role: 'customer'}, sr),
      false,
    );
  });

  it('allows owning customer after accept', () => {
    assert.equal(
      canAccessProviderContact(
        {uid: 'cust-1', role: 'customer'},
        {...sr, status: 'accepted'},
      ),
      true,
    );
  });

  it('denies wrong customer even after accept', () => {
    assert.equal(
      canAccessProviderContact(
        {uid: 'cust-other', role: 'customer'},
        {...sr, status: 'accepted'},
      ),
      false,
    );
  });

  it('allows assigned provider', () => {
    assert.equal(
      canAccessProviderContact(
        {uid: 'prov-1', role: 'provider'},
        {...sr, status: 'pending'},
      ),
      true,
    );
  });
});

describe('canAccessCustomerContact', () => {
  const sr = {
    customerId: 'cust-1',
    providerId: 'prov-1',
    status: 'pending',
    customerPhone: '9000000002',
  };

  it('denies assigned provider before accept', () => {
    assert.equal(
      canAccessCustomerContact({uid: 'prov-1', role: 'provider'}, sr),
      false,
    );
  });

  it('allows assigned provider after accept', () => {
    assert.equal(
      canAccessCustomerContact(
        {uid: 'prov-1', role: 'provider'},
        {...sr, status: 'accepted'},
      ),
      true,
    );
  });

  it('denies other provider after accept', () => {
    assert.equal(
      canAccessCustomerContact(
        {uid: 'prov-other', role: 'provider'},
        {...sr, status: 'accepted'},
      ),
      false,
    );
  });

  it('allows owning customer always', () => {
    assert.equal(
      canAccessCustomerContact({uid: 'cust-1', role: 'customer'}, sr),
      true,
    );
  });
});

describe('toPublicProvider', () => {
  it('strips phone and sensitive fields', () => {
    const out = toPublicProvider({
      _id: 'p1',
      name: 'Ada',
      phone: '9111111111',
      phoneNumber: '9222222222',
      email: 'a@b.com',
      fcmToken: 'tok',
      specialization: 'Plumbing',
      location: {
        city: 'Pune',
        district: 'Pune',
        state: 'MH',
        street: 'Secret Lane',
        latitude: 1,
        longitude: 2,
      },
    });
    assert.equal(out.phone, undefined);
    assert.equal(out.phoneNumber, undefined);
    assert.equal(out.email, undefined);
    assert.equal(out.fcmToken, undefined);
    assert.equal(out.name, 'Ada');
    assert.equal(out.specialization, 'Plumbing');
    assert.equal(out.contactAvailable, false);
    assert.equal(out.location.city, 'Pune');
    assert.equal(out.location.street, undefined);
  });
});

describe('redactServiceRequestForViewer', () => {
  const base = {
    _id: 'sr1',
    customerId: 'cust-1',
    providerId: 'prov-1',
    customerPhone: '9000000002',
    providerPhone: '9000000001',
    secondaryPhone: '9000000003',
    declinedProviders: [
      {providerId: 'x', providerPhone: '999', reason: 'busy'},
    ],
  };

  it('strips provider phone for customer while pending', () => {
    const out = redactServiceRequestForViewer(
      {...base, status: 'pending'},
      {uid: 'cust-1', role: 'customer'},
    );
    assert.equal(out.providerPhone, undefined);
    assert.equal(out.customerPhone, '9000000002');
    assert.equal(out.contact.canCallProvider, false);
    assert.equal(out.contact.providerPhoneAvailable, false);
    assert.equal(out.declinedProviders[0].providerPhone, undefined);
  });

  it('keeps provider phone for customer after accept', () => {
    const out = redactServiceRequestForViewer(
      {...base, status: 'accepted'},
      {uid: 'cust-1', role: 'customer'},
    );
    assert.equal(out.providerPhone, '9000000001');
    assert.equal(out.contact.canCallProvider, true);
    assert.equal(out.contact.providerPhoneAvailable, true);
  });

  it('strips customer phone for provider while pending', () => {
    const out = redactServiceRequestForViewer(
      {...base, status: 'pending'},
      {uid: 'prov-1', role: 'provider'},
    );
    assert.equal(out.customerPhone, undefined);
    assert.equal(out.secondaryPhone, undefined);
    assert.equal(out.contact.canCallCustomer, false);
  });

  it('keeps customer phone for provider after accept', () => {
    const out = redactServiceRequestForViewer(
      {...base, status: 'accepted'},
      {uid: 'prov-1', role: 'provider'},
    );
    assert.equal(out.customerPhone, '9000000002');
    assert.equal(out.contact.canCallCustomer, true);
    assert.equal(out.contact.customerPhoneAvailable, true);
  });
});
