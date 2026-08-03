/**
 * White-label Client — name + themeColors palette.
 */

const mongoose = require('mongoose');

const themeColorsSchema = new mongoose.Schema(
  {
    primary: {type: String, required: true},
    primaryDark: {type: String, required: true},
    secondary: {type: String, required: true},
    secondaryDark: {type: String, required: true},
    background: {type: String, required: true},
    surface: {type: String, required: true},
    text: {type: String, required: true},
    textSecondary: {type: String, required: true},
    border: {type: String, required: true},
    error: {type: String, required: true},
    success: {type: String, required: true},
    warning: {type: String, required: true},
    sidebar: {type: String, required: true},
    sidebarText: {type: String, required: true},
    sidebarMuted: {type: String, required: true},
    marketingBg: {type: String, required: true},
    marketingBgElevated: {type: String, required: true},
    marketingText: {type: String, required: true},
    marketingTextMuted: {type: String, required: true},
    white: {type: String, required: true},
    black: {type: String, required: true},
  },
  {_id: false},
);

const clientSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    themeColors: {
      type: themeColorsSchema,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {_id: true, timestamps: false},
);

const Client = mongoose.model('Client', clientSchema, 'clients');

module.exports = Client;
