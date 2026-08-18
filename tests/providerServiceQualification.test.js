const {test} = require('node:test');
const assert = require('node:assert/strict');
const {
  allServicesForProvider,
  isServiceVerified,
  isServiceCustomerVisible,
  activeServicesForProvider,
  addServiceToProvider,
  applyCustomerServiceView,
  qualificationForService,
  upsertQualification,
  documentsForCategory,
} = require('../src/utils/providerServiceAvailability');

test('allServicesForProvider collects unique names from one Partner', () => {
  const services = allServicesForProvider({
    serviceType: 'Plumber',
    specialization: 'Plumber',
    serviceCategories: ['Plumber', 'Electrician', 'plumber'],
  });
  assert.deepEqual(services, ['Plumber', 'Electrician']);
});

test('existing approved Partner services are verified without explicit qualifications', () => {
  const provider = {
    approvalStatus: 'approved',
    serviceType: 'Plumber',
    serviceCategories: ['Plumber', 'Electrician'],
  };
  assert.equal(isServiceVerified(provider, 'Plumber'), true);
  assert.equal(isServiceVerified(provider, 'Electrician'), true);
  assert.equal(isServiceCustomerVisible(provider, 'Electrician'), true);
});

test('addServiceToProvider does not create a duplicate and keeps one Partner', () => {
  const provider = {
    _id: 'rajveer',
    approvalStatus: 'approved',
    verified: true,
    serviceType: 'Plumber',
    serviceCategories: ['Plumber'],
    serviceQualifications: [
      {name: 'Plumber', verificationStatus: 'approved'},
    ],
    inactiveServiceCategories: [],
  };
  const first = addServiceToProvider(provider, 'Electrician', {source: 'self'});
  assert.equal(first.added, true);
  assert.equal(provider._id, 'rajveer');
  assert.deepEqual(allServicesForProvider(provider), ['Plumber', 'Electrician']);
  assert.equal(qualificationForService(provider, 'Electrician').verificationStatus, 'required');
  assert.equal(isServiceCustomerVisible(provider, 'Electrician'), false);
  assert.equal(isServiceCustomerVisible(provider, 'Plumber'), true);

  const dup = addServiceToProvider(provider, 'electrician', {source: 'self'});
  assert.equal(dup.duplicate, true);
  assert.equal(allServicesForProvider(provider).length, 2);
});

test('unverified and inactive services are hidden from customers', () => {
  const provider = {
    approvalStatus: 'approved',
    serviceType: 'Plumber',
    serviceCategories: ['Plumber', 'Electrician', 'Carpenter'],
    serviceQualifications: [
      {name: 'Plumber', verificationStatus: 'approved'},
      {name: 'Electrician', verificationStatus: 'pending'},
      {name: 'Carpenter', verificationStatus: 'approved'},
    ],
    inactiveServiceCategories: ['Carpenter'],
  };
  assert.deepEqual(activeServicesForProvider(provider), ['Plumber']);
  const publicView = applyCustomerServiceView(provider, 'Electrician');
  assert.equal(publicView.matchedService, 'Plumber');
  assert.deepEqual(publicView.serviceCategories, ['Plumber']);
  assert.equal(publicView.serviceQualifications, undefined);

  const plumberView = applyCustomerServiceView(provider, 'Plumber');
  assert.equal(plumberView.matchedService, 'Plumber');
  assert.equal(plumberView.specialization, 'Plumber');
});

test('submitted pending service stays under review and is not customer-visible', () => {
  const provider = {
    approvalStatus: 'approved',
    serviceType: 'Plumber',
    serviceCategories: ['Plumber', 'Electrician'],
    serviceQualifications: [
      {name: 'Plumber', verificationStatus: 'approved'},
      {
        name: 'Electrician',
        verificationStatus: 'pending',
        submittedAt: new Date(),
        documents: [{key: 'certificate', url: 'https://cdn.example/providers/rajveer/x.pdf'}],
      },
    ],
  };
  assert.equal(qualificationForService(provider, 'Electrician').verificationStatus, 'pending');
  assert.equal(isServiceCustomerVisible(provider, 'Electrician'), false);
});

test('service-specific documents and notes stay on that service only', () => {
  const provider = {
    approvalStatus: 'approved',
    serviceType: 'Plumber',
    serviceCategories: ['Plumber'],
  };
  addServiceToProvider(provider, 'Electrician', {source: 'self'});
  upsertQualification(provider, 'Electrician', 'required', {
    experience: 3,
    notes: 'Home wiring',
    documents: [{key: 'certificate', url: 'https://cdn.example/providers/rajveer/elec.pdf'}],
  });
  const electrician = qualificationForService(provider, 'Electrician');
  const plumber = qualificationForService(provider, 'Plumber');
  assert.equal(electrician.experience, 3);
  assert.equal(electrician.notes, 'Home wiring');
  assert.equal(electrician.documents[0].key, 'certificate');
  assert.equal(plumber.documents.length, 0);
  assert.deepEqual(
    documentsForCategory({
      partnerDocuments: [{key: 'license', required: true, label: 'Electrical license'}],
    }).map((d) => d.key),
    ['license'],
  );
});

test('admin-added service on an approved account is verified', () => {
  const provider = {
    approvalStatus: 'approved',
    verified: true,
    serviceType: 'Plumber',
    serviceCategories: ['Plumber'],
    inactiveServiceCategories: [],
  };
  addServiceToProvider(provider, 'Electrician', {source: 'admin'});
  assert.equal(isServiceVerified(provider, 'Electrician'), true);
  assert.equal(isServiceCustomerVisible(provider, 'Electrician'), true);
});
