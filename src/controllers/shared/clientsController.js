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
const ADMIN_LIST_SORT = require('../../utils/adminListSort');
const s3 = require('../../services/s3.service');
const {keyFromUrlOrKey} = require('../../utils/s3Keys');

function resolvePublicLogoUrl(logoUrl) {
  const raw = String(logoUrl || '').trim();
  if (!raw) return '';
  if (/^https:\/\/assets\.akanso\.in\//i.test(raw)) return raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      if (parsed.pathname.startsWith('/uploads/')) {
        const key = parsed.pathname.slice('/uploads/'.length);
        return s3.generateCloudFrontUrl(key);
      }
    } catch {
      /* fall through */
    }
  }
  try {
    const key = keyFromUrlOrKey(raw);
    return s3.generateCloudFrontUrl(key);
  } catch {
    return raw;
  }
}

function slugifyId(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function brandingPayload(activeClientId, client) {
  const customerProductName =
    (client.customerProductName || '').trim() || client.name || 'Home Services';
  const providerProductName =
    (client.providerProductName || '').trim() ||
    `${client.name || 'Home Services'} Provider`;
  return {
    clientId: activeClientId,
    clientName: client.name,
    customerProductName,
    providerProductName,
    logoUrl: resolvePublicLogoUrl(client.logoUrl || ''),
    themeColors: client.themeColors,
  };
}

/**
 * GET /api/branding — public, active client's theme + product branding
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
          customerProductName: 'Home Services',
          providerProductName: 'Home Services Provider',
          logoUrl: '',
          themeColors: HOMESERVICES,
        },
      });
    }

    res.json({
      success: true,
      data: brandingPayload(activeClientId, client),
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
    const clients = await Client.find().sort(ADMIN_LIST_SORT).lean();

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
    const {
      name,
      themeColors,
      customerProductName,
      providerProductName,
      logoUrl,
    } = req.body;
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
      customerProductName: String(customerProductName || '').trim(),
      providerProductName: String(providerProductName || '').trim(),
      logoUrl: String(logoUrl || '').trim(),
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
    const {
      name,
      themeColors,
      customerProductName,
      providerProductName,
      logoUrl,
    } = req.body;

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

    if (customerProductName !== undefined) {
      client.customerProductName = String(customerProductName || '').trim();
    }
    if (providerProductName !== undefined) {
      client.providerProductName = String(providerProductName || '').trim();
    }
    if (logoUrl !== undefined) {
      client.logoUrl = String(logoUrl || '').trim();
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
      data: brandingPayload(clientId, client),
      message: `Client "${client.name}" is now active`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/clients/:clientId/logo — multipart field `file` → S3 + CloudFront
 */
exports.uploadClientLogo = async (req, res, next) => {
  try {
    const s3 = require('../../services/s3.service');
    const {validateImageBuffer} = require('../../utils/assetValidation');
    const {
      buildClientLogoKey,
      keyFromUrlOrKey,
      normalizeObjectKey,
    } = require('../../utils/s3Keys');

    const {clientId} = req.params;
    const client = await Client.findById(clientId);
    if (!client) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: 'Client not found',
      });
    }
    if (!req.file?.buffer) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'Logo file is required (field: file)',
      });
    }

    const validated = validateImageBuffer(req.file.buffer, req.file.mimetype);
    const key = buildClientLogoKey(clientId, validated.extension);
    const uploaded = await s3.uploadFile({
      body: req.file.buffer,
      key,
      contentType: validated.contentType,
      userId: req.user?.uid,
    });

    const previous = client.logoUrl;
    client.logoUrl = uploaded.url;
    client.updatedAt = new Date();
    await client.save();

    if (previous && previous !== uploaded.url) {
      try {
        const oldKey = keyFromUrlOrKey(previous);
        normalizeObjectKey(oldKey);
        await s3.deleteObject(oldKey, {userId: req.user?.uid});
      } catch {
        /* ignore legacy disk URLs */
      }
    }

    res.json({
      success: true,
      data: {
        logoUrl: uploaded.url,
        key: uploaded.key,
        contentType: uploaded.contentType,
        size: uploaded.size,
        client,
      },
      message: 'Logo uploaded successfully',
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
