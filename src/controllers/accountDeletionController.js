/**
 * GET  /partner/account-deletion  — Play Console HTML (no login)
 * GET  /customer/account-deletion — Play Console HTML (no login)
 * DELETE /api/partner/account-deletion  — Partner app
 * DELETE /api/customer/account-deletion — Customer app
 */

const {
  resolveAccountDeletionLang,
  renderAccountDeletionHtml,
} = require('../utils/accountDeletionPage');
const {deleteOwnNonAdminAccount} = require('../services/accountDeletionService');

function sendAccountDeletionPage(audience) {
  return (req, res) => {
    const lang = resolveAccountDeletionLang(req);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.status(200).send(renderAccountDeletionHtml(audience, lang));
  };
}

async function deleteSignedInAccount(req, res, next) {
  try {
    const uid = await deleteOwnNonAdminAccount(req.user && req.user.uid);
    res.json({
      success: true,
      data: {_id: uid},
      message: 'Account deleted.',
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        error: error.name || 'Error',
        message: error.message,
      });
    }
    next(error);
  }
}

module.exports = {
  getPartnerAccountDeletionPage: sendAccountDeletionPage('partner'),
  getCustomerAccountDeletionPage: sendAccountDeletionPage('customer'),
  deletePartnerAccount: deleteSignedInAccount,
  deleteCustomerAccount: deleteSignedInAccount,
};
