/**
 * Public Play Console account-deletion pages.
 * Canonical paths:
 *   GET /partner/account-deletion
 *   GET /customer/account-deletion
 */

const SUPPORT_EMAIL = 'support@akansho.com';
const SUPPORT_PHONE = '+918986849919';

const SHARED = {
  en: {
    htmlLang: 'en',
    otherLang: 'हिंदी',
    otherLangHref: '?lang=hi',
    inAppTitle: 'How to delete in the app',
    afterTitle: 'What happens after you confirm',
    noAppTitle: 'If you cannot use the app',
    related: 'Related',
    privacy: 'Privacy Policy',
  },
  hi: {
    htmlLang: 'hi',
    otherLang: 'English',
    otherLangHref: '?lang=en',
    inAppTitle: 'ऐप में कैसे हटाएँ',
    afterTitle: 'पुष्टि के बाद क्या होता है',
    noAppTitle: 'यदि ऐप इस्तेमाल नहीं कर सकते',
    related: 'संबंधित',
    privacy: 'गोपनीयता नीति',
  },
};

const APPS = {
  partner: {
    kicker: 'Akansho Partner',
    privacyHref: 'https://partner.akansho.com/privacy',
    en: {
      title: 'Delete your Akansho Partner account',
      lead: 'You can delete your Akansho Partner account from the app. Uninstalling the app from your phone does not delete your Akansho account.',
      steps: [
        'Open the Akansho Partner app.',
        'Go to Settings → Account & security → Delete account & data.',
        'Confirm. This permanently removes your Partner account and personal data we no longer need to keep.',
      ],
      after:
        'We delete or irreversibly anonymise profile details, phone number, photos, verification documents, and job content tied to you, except records we must keep for Indian law, tax, dispute, fraud, or safety purposes — and only for as long as those rules require.',
      noApp: `Email ${SUPPORT_EMAIL} or call ${SUPPORT_PHONE} and ask us to delete your Partner account. We process these requests as soon as reasonably possible. You do not need to stay signed in.`,
    },
    hi: {
      title: 'अपना Akansho Partner खाता हटाएँ',
      lead: 'आप Akansho Partner ऐप से अपना खाता हटा सकते हैं। फ़ोन से ऐप अनइंस्टॉल करने से आपका Akansho खाता नहीं हटता।',
      steps: [
        'Akansho Partner ऐप खोलें।',
        'सेटिंग्स → खाता और सुरक्षा → खाता और डेटा हटाएँ पर जाएँ।',
        'पुष्टि करें। इससे आपका Partner खाता और वह व्यक्तिगत डेटा स्थायी रूप से हट जाता है जिसकी हमें अब ज़रूरत नहीं।',
      ],
      after:
        'हम प्रोफ़ाइल, फ़ोन नंबर, फ़ोटो, सत्यापन दस्तावेज़ और आपसे जुड़े जॉब डेटा को हटाते या अज्ञात करते हैं, सिवाय जहाँ भारतीय कानून, कर, विवाद, धोखाधड़ी या सुरक्षा के लिए सीमित रिकॉर्ड रखना आवश्यक हो — और केवल उतने समय तक जितना उन नियमों के लिए चाहिए।',
      noApp: `${SUPPORT_EMAIL} पर ईमेल करें या ${SUPPORT_PHONE} पर कॉल करें और Partner खाता हटाने को कहें। हम यह अनुरोध जल्द से जल्द पूरा करते हैं। साइन-इन रहना ज़रूरी नहीं है।`,
    },
  },
  customer: {
    kicker: 'Akansho',
    privacyHref: 'https://akansho.com/privacy',
    en: {
      title: 'Delete your Akansho Customer account',
      lead: 'You can delete your Akansho Customer account from the app. Uninstalling the app from your phone does not delete your Akansho account.',
      steps: [
        'Open the Akansho app.',
        'Go to Settings → Delete account.',
        'Confirm. This permanently removes your Customer account and personal data we no longer need to keep. If you also have Partner access on the same phone, that access is removed too.',
      ],
      after:
        'We delete or irreversibly anonymise profile details, phone number, addresses, photos, and job content tied to you, except records we must keep for Indian law, tax, dispute, fraud, or safety purposes — and only for as long as those rules require.',
      noApp: `Email ${SUPPORT_EMAIL} or call ${SUPPORT_PHONE} and ask us to delete your Customer account. We process these requests as soon as reasonably possible. You do not need to stay signed in.`,
    },
    hi: {
      title: 'अपना Akansho ग्राहक खाता हटाएँ',
      lead: 'आप Akansho ऐप से अपना ग्राहक खाता हटा सकते हैं। फ़ोन से ऐप अनइंस्टॉल करने से आपका Akansho खाता नहीं हटता।',
      steps: [
        'Akansho ऐप खोलें।',
        'सेटिंग्स → खाता हटाएँ पर जाएँ।',
        'पुष्टि करें। इससे आपका ग्राहक खाता और वह व्यक्तिगत डेटा स्थायी रूप से हट जाता है जिसकी हमें अब ज़रूरत नहीं। यदि उसी फ़ोन पर पार्टनर एक्सेस भी है, तो वह भी हट जाता है।',
      ],
      after:
        'हम प्रोफ़ाइल, फ़ोन नंबर, पते, फ़ोटो और आपसे जुड़े जॉब डेटा को हटाते या अज्ञात करते हैं, सिवाय जहाँ भारतीय कानून, कर, विवाद, धोखाधड़ी या सुरक्षा के लिए सीमित रिकॉर्ड रखना आवश्यक हो — और केवल उतने समय तक जितना उन नियमों के लिए चाहिए।',
      noApp: `${SUPPORT_EMAIL} पर ईमेल करें या ${SUPPORT_PHONE} पर कॉल करें और ग्राहक खाता हटाने को कहें। हम यह अनुरोध जल्द से जल्द पूरा करते हैं। साइन-इन रहना ज़रूरी नहीं है।`,
    },
  },
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function resolveAccountDeletionLang(req) {
  const q = String(req?.query?.lang || req?.query?.hl || '')
    .trim()
    .toLowerCase();
  if (q.startsWith('hi')) return 'hi';
  if (q.startsWith('en')) return 'en';
  const accept = String(req?.headers?.['accept-language'] || '').toLowerCase();
  if (accept.startsWith('hi') || /(^|,)\s*hi\b/.test(accept)) return 'hi';
  return 'en';
}

function renderAccountDeletionHtml(audience, lang) {
  const app = APPS[audience] || APPS.customer;
  const shared = SHARED[lang] || SHARED.en;
  const copy = app[lang] || app.en;
  const steps = copy.steps
    .map((step) => `<li>${escapeHtml(step)}</li>`)
    .join('');
  return `<!DOCTYPE html>
<html lang="${shared.htmlLang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(copy.title)}</title>
  <meta name="description" content="${escapeHtml(copy.lead)}">
  <style>
    :root { color-scheme: light; }
    body { margin: 0; font: 16px/1.5 system-ui, sans-serif; color: #1a1a1a; background: #f6f4f0; }
    main { max-width: 40rem; margin: 0 auto; padding: 1.25rem 1rem 3rem; }
    h1 { font-size: 1.5rem; line-height: 1.3; margin: 0 0 .75rem; }
    h2 { font-size: 1.05rem; margin: 1.5rem 0 .5rem; }
    p, li { margin: 0 0 .75rem; }
    ol { padding-left: 1.25rem; }
    a { color: #0b5c3a; }
    .top { display: flex; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; font-size: .9rem; }
    .kicker { color: #5c574e; }
  </style>
</head>
<body>
  <main>
    <div class="top">
      <span class="kicker">${escapeHtml(app.kicker)}</span>
      <a href="${escapeHtml(shared.otherLangHref)}">${escapeHtml(shared.otherLang)}</a>
    </div>
    <h1>${escapeHtml(copy.title)}</h1>
    <p>${escapeHtml(copy.lead)}</p>
    <h2>${escapeHtml(shared.inAppTitle)}</h2>
    <ol>${steps}</ol>
    <h2>${escapeHtml(shared.afterTitle)}</h2>
    <p>${escapeHtml(copy.after)}</p>
    <h2>${escapeHtml(shared.noAppTitle)}</h2>
    <p>${escapeHtml(copy.noApp)}</p>
    <p>
      <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>
      ·
      <a href="tel:${SUPPORT_PHONE}">${SUPPORT_PHONE}</a>
    </p>
    <h2>${escapeHtml(shared.related)}</h2>
    <p><a href="${escapeHtml(app.privacyHref)}">${escapeHtml(shared.privacy)}</a></p>
  </main>
</body>
</html>`;
}

function renderPartnerAccountDeletionHtml(lang) {
  return renderAccountDeletionHtml('partner', lang);
}

function renderCustomerAccountDeletionHtml(lang) {
  return renderAccountDeletionHtml('customer', lang);
}

module.exports = {
  SUPPORT_EMAIL,
  SUPPORT_PHONE,
  resolveAccountDeletionLang,
  renderAccountDeletionHtml,
  renderPartnerAccountDeletionHtml,
  renderCustomerAccountDeletionHtml,
};
