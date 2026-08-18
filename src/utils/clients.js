/**
 * Ensure default clients + activeClientId exist.
 */

const Client = require('../models/Client');
const SystemConfig = require('../models/SystemConfig');
const {ensureConfig} = require('./superAdmin');
const {
  DEFAULT_CLIENTS,
  DEFAULT_ACTIVE_CLIENT_ID,
} = require('./defaultThemeColors');

const BRANDING_PALETTE_VERSION = '2026-08-standard-palettes-v1';

async function ensureClientsSeeded() {
  const count = await Client.countDocuments();
  if (count === 0) {
    const now = new Date();
    await Client.insertMany(
      DEFAULT_CLIENTS.map((c) => ({
        ...c,
        createdAt: now,
        updatedAt: now,
      })),
    );
  }

  await ensureConfig();

  let config = await SystemConfig.findById('global').lean();
  if (config?.brandingPaletteVersion !== BRANDING_PALETTE_VERSION) {
    const now = new Date();
    const presetById = new Map(
      DEFAULT_CLIENTS.map((client) => [client._id, client.themeColors]),
    );
    for (const clientId of ['facebook', 'google']) {
      const themeColors = presetById.get(clientId);
      if (!themeColors) continue;
      await Client.findByIdAndUpdate(clientId, {
        $set: {
          themeColors,
          updatedAt: now,
        },
      });
    }
    await SystemConfig.findByIdAndUpdate('global', {
      $set: {
        brandingPaletteVersion: BRANDING_PALETTE_VERSION,
        updatedAt: now,
      },
    });
    config = await SystemConfig.findById('global').lean();
  }
  if (!config?.activeClientId) {
    await SystemConfig.findByIdAndUpdate('global', {
      $set: {activeClientId: DEFAULT_ACTIVE_CLIENT_ID, updatedAt: new Date()},
    });
    config = {
      ...(config || {}),
      activeClientId: DEFAULT_ACTIVE_CLIENT_ID,
    };
  }

  const activeId = config.activeClientId || DEFAULT_ACTIVE_CLIENT_ID;
  let active = await Client.findById(activeId).lean();
  if (!active) {
    active = await Client.findById(DEFAULT_ACTIVE_CLIENT_ID).lean();
    if (active) {
      await SystemConfig.findByIdAndUpdate('global', {
        $set: {
          activeClientId: DEFAULT_ACTIVE_CLIENT_ID,
          updatedAt: new Date(),
        },
      });
      return {activeClientId: DEFAULT_ACTIVE_CLIENT_ID, client: active};
    }
    active = await Client.findOne().lean();
    if (active) {
      await SystemConfig.findByIdAndUpdate('global', {
        $set: {activeClientId: active._id, updatedAt: new Date()},
      });
      return {activeClientId: active._id, client: active};
    }
  }

  return {activeClientId: activeId, client: active};
}

module.exports = {
  ensureClientsSeeded,
};
