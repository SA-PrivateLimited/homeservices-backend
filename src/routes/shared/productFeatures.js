/**
 * Public product feature flags for Customer / Partner apps.
 */

const express = require('express');
const router = express.Router();
const {
  isJobCardCommentsEnabled,
} = require('../../services/jobCardCommentsPolicyService');

router.get('/features', async (req, res, next) => {
  try {
    const allowJobCardComments = await isJobCardCommentsEnabled();
    res.json({
      success: true,
      data: {allowJobCardComments},
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
