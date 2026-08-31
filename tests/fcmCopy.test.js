const test = require('node:test');
const assert = require('node:assert/strict');
const {
  partnerNewJob,
  partnerJobUpdated,
  partnerJobCancelled,
  customerPartnerAccepted,
  customerWorkStarted,
} = require('../src/utils/fcmCopy');

test('partner cancel copy is short and includes reason', () => {
  const copy = partnerJobCancelled({
    customerName: 'sandeep k gupta',
    serviceType: 'Landlord',
    reason: 'Longer time',
  });
  assert.equal(copy.title, 'Job Cancelled update');
  assert.equal(
    copy.body,
    'sandeep k gupta cancelled the Landlord job. Reason: Longer time',
  );
});

test('partner new job copy names the service', () => {
  const copy = partnerNewJob({
    customerName: 'Ravi',
    serviceType: 'Electrician',
  });
  assert.equal(copy.title, 'New job update');
  assert.equal(copy.body, 'Ravi needs Electrician near you');
});

test('partner updated copy stays specific', () => {
  const copy = partnerJobUpdated({
    customerName: 'Ravi',
    serviceType: 'Plumber',
  });
  assert.equal(copy.title, 'Job details update');
  assert.equal(copy.body, 'Ravi updated the Plumber job');
});

test('customer accepted copy names the partner and service', () => {
  const copy = customerPartnerAccepted({
    providerName: 'Ramesh',
    serviceType: 'Electrician',
  });
  assert.equal(copy.title, 'Job accepted update');
  assert.equal(copy.body, 'Ramesh accepted your Electrician job.');
});

test('customer in-progress copy includes PIN when present', () => {
  const copy = customerWorkStarted({
    providerName: 'Ramesh',
    serviceType: 'Electrician',
    pin: '4821',
  });
  assert.equal(copy.title, 'Work started update');
  assert.equal(copy.body, 'Ramesh started your Electrician job. PIN: 4821');
});
