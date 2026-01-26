/**
 * Translation Utility
 * Handles i18n for backend API responses
 */

const translations = {
  en: {
    jobCards: {
      notFound: 'Job card not found',
      alreadyCancelled: 'Job card is already cancelled',
      cannotCancelCompleted: 'Cannot cancel a completed job',
      cancelledSuccessfully: 'Job card cancelled successfully',
      cancellationReasonRequired: 'Cancellation reason is required',
      badRequest: 'Bad Request',
    },
    serviceRequests: {
      notFound: 'Service request not found',
      alreadyCancelled: 'Service request is already cancelled',
      cancelled: 'Service request cancelled successfully',
      cancellationReasonRequired: 'Cancellation reason is required',
      invalidAddress: 'Invalid address. Address and pincode are required',
      serviceTypeRequired: 'Service type is required',
      created: 'Service request created successfully',
      updated: 'Service request updated successfully',
    },
    common: {
      unauthorized: 'Unauthorized',
      notFound: 'Not found',
      serverError: 'Internal server error',
      success: 'Success',
    },
  },
  hi: {
    jobCards: {
      notFound: 'जॉब कार्ड नहीं मिला',
      alreadyCancelled: 'जॉब कार्ड पहले से ही रद्द है',
      cannotCancelCompleted: 'पूर्ण किए गए जॉब को रद्द नहीं किया जा सकता',
      cancelledSuccessfully: 'जॉब कार्ड सफलतापूर्वक रद्द कर दिया गया',
      cancellationReasonRequired: 'रद्दीकरण का कारण आवश्यक है',
      badRequest: 'गलत अनुरोध',
    },
    serviceRequests: {
      notFound: 'सेवा अनुरोध नहीं मिला',
      alreadyCancelled: 'सेवा अनुरोध पहले से ही रद्द है',
      cancelled: 'सेवा अनुरोध सफलतापूर्वक रद्द कर दिया गया',
      cancellationReasonRequired: 'रद्दीकरण का कारण आवश्यक है',
      invalidAddress: 'अमान्य पता। पता और पिनकोड आवश्यक हैं',
      serviceTypeRequired: 'सेवा प्रकार आवश्यक है',
      created: 'सेवा अनुरोध सफलतापूर्वक बनाया गया',
      updated: 'सेवा अनुरोध सफलतापूर्वक अपडेट किया गया',
    },
    common: {
      unauthorized: 'अनधिकृत',
      notFound: 'नहीं मिला',
      serverError: 'आंतरिक सर्वर त्रुटि',
      success: 'सफलता',
    },
  },
};

/**
 * Get translation for a key
 * @param {string} key - Translation key (e.g., 'jobCards.notFound')
 * @param {string} lang - Language code ('en' or 'hi')
 * @param {object} params - Optional parameters for interpolation
 * @returns {string} Translated string
 */
function t(key, lang = 'en', params = {}) {
  const keys = key.split('.');
  let value = translations[lang] || translations.en;

  for (const k of keys) {
    if (value && typeof value === 'object') {
      value = value[k];
    } else {
      // Fallback to English if key not found
      value = translations.en;
      for (const fallbackKey of keys) {
        if (value && typeof value === 'object') {
          value = value[fallbackKey];
        } else {
          return key; // Return key if translation not found
        }
      }
      break;
    }
  }

  if (typeof value !== 'string') {
    return key; // Return key if translation not found
  }

  // Simple parameter interpolation
  if (params && Object.keys(params).length > 0) {
    return value.replace(/\{\{(\w+)\}\}/g, (match, paramKey) => {
      return params[paramKey] !== undefined ? params[paramKey] : match;
    });
  }

  return value;
}

/**
 * Middleware to detect language from request headers
 * Attaches req.lang to request object
 */
function detectLanguage(req, res, next) {
  // Check Accept-Language header
  const acceptLanguage = req.headers['accept-language'] || 'en';
  
  // Parse language (e.g., 'en-US,en;q=0.9' -> 'en')
  let lang = 'en';
  if (acceptLanguage.includes('hi') || acceptLanguage.includes('hi-IN')) {
    lang = 'hi';
  } else if (acceptLanguage.includes('en')) {
    lang = 'en';
  }

  // Also check custom header if provided
  const customLang = req.headers['x-language'] || req.headers['x-locale'];
  if (customLang && (customLang === 'en' || customLang === 'hi')) {
    lang = customLang;
  }

  req.lang = lang;
  next();
}

module.exports = {
  t,
  detectLanguage,
  translations,
};
