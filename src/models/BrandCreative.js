/**
 * Public Akanso creative images stored on S3/CloudFront.
 */

const mongoose = require('mongoose');

const brandCreativeSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true,
    },
    label: {
      type: String,
      trim: true,
      default: '',
      maxlength: 120,
    },
    originalName: {
      type: String,
      trim: true,
      default: '',
      maxlength: 200,
    },
    key: {
      type: String,
      required: true,
    },
    url: {
      type: String,
      required: true,
    },
    contentType: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      default: 0,
    },
    uploadedBy: {
      type: String,
      default: '',
    },
  },
  {timestamps: true, collection: 'brandCreatives'},
);

brandCreativeSchema.index({createdAt: -1});

module.exports = mongoose.model('BrandCreative', brandCreativeSchema);
