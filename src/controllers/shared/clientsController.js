/**
 * Clients + Branding Controller
 */

const Client = require('../../models/Client');
const SystemConfig = require('../../models/SystemConfig');
const {ensureClientsSeeded} = require('../../utils/clients');
const {
  DEFAULT_ACTIVE_CLIENT_ID,
  HOMESERVICES,
  validateThemeColors,
  normalizeThemeColors,
} = require('../../utils/defaultThemeColors');

function slugifyId(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

/**
 * GET /api/branding — public, active client's themeColors
 */
exports.getBranding = async (req, res, next) => {
  try {
    const {activeClientId, client} = await ensureClientsSeeded();
    if (!client) {
      return res.json({
        success: true,
        data: {
          clientId: DEFAULT_ACTIVE_CLIENT_ID,
          clientName: 'Home Services',
          themeColors: HOMESERVICES,
        },
      });
    }

    res.json({
      success: true,
      data: {
        clientId: activeClientId,
        clientName: client.name,
        themeColors: client.themeColors,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/clients
 */
exports.listClients = async (req, res, next) => {
  try {
    await ensureClientsSeeded();
    const config = await SystemConfig.findById('global').lean();
    const activeClientId =
      config?.activeClientId || DEFAULT_ACTIVE_CLIENT_ID;
    const clients = await Client.find().sort({name: 1}).lean();

    res.json({
      success: true,
      data: {
        activeClientId,
        clients,
      },
      count: clients.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/clients
 */
exports.createClient = async (req, res, next) => {
  try {
    await ensureClientsSeeded();
    const {name, themeColors} = req.body;
    let {_id} = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'name is required',
      });
    }

    const colorError = validateThemeColors(themeColors);
    if (colorError) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: colorError,
      });
    }

    if (!_id) {
      _id = slugifyId(name);
    } else {
      _id = slugifyId(_id);
    }

    if (!_id) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Valid client id is required',
      });
    }

    const existing = await Client.findById(_id);
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'Conflict',
        message: `Client "${_id}" already exists`,
      });
    }

    const now = new Date();
    const client = new Client({
      _id,
      name: String(name).trim(),
      themeColors: normalizeThemeColors(themeColors),
      createdAt: now,
      updatedAt: now,
    });
    await client.save();

    res.status(201).json({
      success: true,
      data: client,
      message: 'Client created successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/admin/clients/:clientId
 */
exports.updateClient = async (req, res, next) => {
  try {
    const {clientId} = req.params;
    const {name, themeColors} = req.body;

    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Client not found',
      });
    }

    if (name !== undefined) {
      if (!String(name).trim()) {
        return res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: 'name cannot be empty',
        });
      }
      client.name = String(name).trim();
    }

    if (themeColors !== undefined) {
      const colorError = validateThemeColors(themeColors);
      if (colorError) {
        return res.status(400).json({
          success: false,
          error: 'Bad Request',
          message: colorError,
        });
      }
      client.themeColors = normalizeThemeColors(themeColors);
    }

    client.updatedAt = new Date();
    await client.save();

    res.json({
      success: true,
      data: client,
      message: 'Client updated successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * PUT /api/admin/clients/:clientId/activate
 */
exports.activateClient = async (req, res, next) => {
  try {
    await ensureClientsSeeded();
    const {clientId} = req.params;
    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Client not found',
      });
    }

    await SystemConfig.findByIdAndUpdate('global', {
      $set: {
        activeClientId: clientId,
        updatedAt: new Date(),
        updatedBy: req.user?._id || null,
      },
    });

    res.json({
      success: true,
      data: {
        activeClientId: clientId,
        clientId: client._id,
        clientName: client.name,
        themeColors: client.themeColors,
      },
      message: `Client "${client.name}" is now active`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * DELETE /api/admin/clients/:clientId
 */
exports.deleteClient = async (req, res, next) => {
  try {
    await ensureClientsSeeded();
    const {clientId} = req.params;
    const config = await SystemConfig.findById('global').lean();
    const activeClientId =
      config?.activeClientId || DEFAULT_ACTIVE_CLIENT_ID;

    if (clientId === activeClientId) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Cannot delete the active client. Activate another client first.',
      });
    }

    const total = await Client.countDocuments();
    if (total <= 1) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Cannot delete the last client',
      });
    }

    const client = await Client.findByIdAndDelete(clientId);
    if (!client) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Client not found',
      });
    }

    res.json({
      success: true,
      data: client,
      message: 'Client deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};
