const {test} = require('node:test');
const assert = require('node:assert/strict');
const {
  SUPPORT_EMAIL,
  SUPPORT_PHONE,
  resolveAccountDeletionLang,
  renderPartnerAccountDeletionHtml,
  renderCustomerAccountDeletionHtml,
} = require('../src/utils/accountDeletionPage');
const {
  getPartnerAccountDeletionPage,
  getCustomerAccountDeletionPage,
  deletePartnerAccount,
} = require('../src/controllers/accountDeletionController');

function mockRes() {
  const headers = {};
  const res = {
    headers,
    statusCode: 0,
    body: '',
    setHeader(name, value) {
      headers[name] = value;
    },
    status(code) {
      res.statusCode = code;
      return res;
    },
    send(html) {
      res.body = html;
    },
  };
  return res;
}

test('resolveAccountDeletionLang reads query then Accept-Language', () => {
  assert.equal(resolveAccountDeletionLang({query: {lang: 'hi'}}), 'hi');
  assert.equal(resolveAccountDeletionLang({query: {hl: 'en'}}), 'en');
  assert.equal(
    resolveAccountDeletionLang({
      query: {},
      headers: {'accept-language': 'hi-IN,hi;q=0.9'},
    }),
    'hi',
  );
  assert.equal(resolveAccountDeletionLang({query: {}, headers: {}}), 'en');
});

test('English Partner deletion page explains in-app path and uninstall', () => {
  const html = renderPartnerAccountDeletionHtml('en');
  assert.match(html, /<html lang="en">/);
  assert.match(html, /Delete your Akansho Partner account/);
  assert.match(html, /Uninstalling the app/);
  assert.match(html, /Account &amp; security/);
  assert.match(html, /Delete account &amp; data/);
  assert.match(html, new RegExp(SUPPORT_EMAIL));
  assert.match(html, new RegExp(SUPPORT_PHONE.replace('+', '\\+')));
});

test('Hindi Partner deletion page keeps the same Play facts', () => {
  const html = renderPartnerAccountDeletionHtml('hi');
  assert.match(html, /<html lang="hi">/);
  assert.match(html, /खाता हटाएँ/);
  assert.match(html, /अनइंस्टॉल/);
  assert.match(html, /खाता और डेटा हटाएँ/);
  assert.match(html, new RegExp(SUPPORT_EMAIL));
});

test('English Customer deletion page matches HomeServices Settings copy', () => {
  const html = renderCustomerAccountDeletionHtml('en');
  assert.match(html, /Delete your Akansho Customer account/);
  assert.match(html, /Settings → Delete account/);
  assert.match(html, /Partner access/);
  assert.doesNotMatch(html, /Akansho Partner app/);
  assert.match(html, /akansho.com\/privacy/);
});

test('Hindi Customer deletion page keeps the same Play facts', () => {
  const html = renderCustomerAccountDeletionHtml('hi');
  assert.match(html, /ग्राहक खाता हटाएँ/);
  assert.match(html, /सेटिंग्स → खाता हटाएँ/);
  assert.match(html, /पार्टनर एक्सेस/);
});

test('GET handlers return HTML for Play Console crawlers', () => {
  const partner = mockRes();
  getPartnerAccountDeletionPage({query: {lang: 'en'}, headers: {}}, partner);
  assert.equal(partner.statusCode, 200);
  assert.equal(partner.headers['Content-Type'], 'text/html; charset=utf-8');
  assert.match(partner.body, /Delete your Akansho Partner account/);

  const customer = mockRes();
  getCustomerAccountDeletionPage({query: {lang: 'en'}, headers: {}}, customer);
  assert.equal(customer.statusCode, 200);
  assert.match(customer.body, /Delete your Akansho Customer account/);
});

test('DELETE handler rejects unauthenticated callers', async () => {
  const res = mockRes();
  res.json = (payload) => {
    res.body = payload;
    return res;
  };
  await deletePartnerAccount({user: null}, res, () => {});
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.success, false);
});
