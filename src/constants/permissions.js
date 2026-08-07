/**
 * Centralized admin capability permissions (RBAC).
 * Never hardcode these strings at call sites — import from here.
 */

const PERMISSIONS = Object.freeze({
  OVERVIEW_VIEW: 'overview.view',

  PROVIDERS_VIEW: 'providers.view',
  PROVIDERS_CREATE: 'providers.create',
  PROVIDERS_UPDATE: 'providers.update',
  PROVIDERS_DELETE: 'providers.delete',

  CUSTOMERS_VIEW: 'customers.view',
  CUSTOMERS_CREATE: 'customers.create',
  CUSTOMERS_UPDATE: 'customers.update',
  CUSTOMERS_DELETE: 'customers.delete',

  JOBS_VIEW: 'jobs.view',
  JOBS_ASSIGN: 'jobs.assign',
  JOBS_UPDATE: 'jobs.update',
  JOBS_DELETE: 'jobs.delete',

  CATEGORIES_VIEW: 'categories.view',
  CATEGORIES_CREATE: 'categories.create',
  CATEGORIES_UPDATE: 'categories.update',
  CATEGORIES_DELETE: 'categories.delete',

  GEOGRAPHY_VIEW: 'geography.view',
  GEOGRAPHY_UPDATE: 'geography.update',

  CONTACTS_VIEW: 'contacts.view',
  CONTACTS_UPDATE: 'contacts.update',

  CLIENTS_VIEW: 'clients.view',
  CLIENTS_CREATE: 'clients.create',
  CLIENTS_UPDATE: 'clients.update',
  CLIENTS_DELETE: 'clients.delete',

  /** Manage other admin accounts (invite / permissions). Super Admin elevation still required. */
  ADMINS_VIEW: 'admins.view',
  ADMINS_MANAGE: 'admins.manage',
});

/** All known permission string values. */
const ALL_PERMISSION_VALUES = Object.freeze(Object.values(PERMISSIONS));

/**
 * Module groups for invite / edit UI.
 * Checking a module grants every permission in that group.
 */
const PERMISSION_MODULES = Object.freeze([
  {
    id: 'overview',
    label: 'Overview',
    permissions: [PERMISSIONS.OVERVIEW_VIEW],
  },
  {
    id: 'providers',
    label: 'Providers',
    permissions: [
      PERMISSIONS.PROVIDERS_VIEW,
      PERMISSIONS.PROVIDERS_CREATE,
      PERMISSIONS.PROVIDERS_UPDATE,
      PERMISSIONS.PROVIDERS_DELETE,
    ],
  },
  {
    id: 'customers',
    label: 'Customers',
    permissions: [
      PERMISSIONS.CUSTOMERS_VIEW,
      PERMISSIONS.CUSTOMERS_CREATE,
      PERMISSIONS.CUSTOMERS_UPDATE,
      PERMISSIONS.CUSTOMERS_DELETE,
    ],
  },
  {
    id: 'jobs',
    label: 'Jobs',
    permissions: [
      PERMISSIONS.JOBS_VIEW,
      PERMISSIONS.JOBS_ASSIGN,
      PERMISSIONS.JOBS_UPDATE,
      PERMISSIONS.JOBS_DELETE,
    ],
  },
  {
    id: 'categories',
    label: 'Categories',
    permissions: [
      PERMISSIONS.CATEGORIES_VIEW,
      PERMISSIONS.CATEGORIES_CREATE,
      PERMISSIONS.CATEGORIES_UPDATE,
      PERMISSIONS.CATEGORIES_DELETE,
    ],
  },
  {
    id: 'geography',
    label: 'Geography',
    permissions: [PERMISSIONS.GEOGRAPHY_VIEW, PERMISSIONS.GEOGRAPHY_UPDATE],
  },
  {
    id: 'contacts',
    label: 'Contacts',
    permissions: [PERMISSIONS.CONTACTS_VIEW, PERMISSIONS.CONTACTS_UPDATE],
  },
  {
    id: 'clients',
    label: 'Clients',
    permissions: [
      PERMISSIONS.CLIENTS_VIEW,
      PERMISSIONS.CLIENTS_CREATE,
      PERMISSIONS.CLIENTS_UPDATE,
      PERMISSIONS.CLIENTS_DELETE,
    ],
  },
]);

const PERMISSION_SET = new Set(ALL_PERMISSION_VALUES);

/**
 * Normalize an incoming permission list to known values only (deduped).
 * @param {unknown} permissions
 * @returns {string[]}
 */
function normalizePermissions(permissions) {
  if (!Array.isArray(permissions)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of permissions) {
    const p = String(raw || '').trim();
    if (!p || seen.has(p)) continue;
    // Accept known constants; also accept legacy module ids by expanding
    if (PERMISSION_SET.has(p)) {
      seen.add(p);
      out.push(p);
      continue;
    }
    const mod = PERMISSION_MODULES.find((m) => m.id === p);
    if (mod) {
      for (const mp of mod.permissions) {
        if (!seen.has(mp)) {
          seen.add(mp);
          out.push(mp);
        }
      }
    }
  }
  return out;
}

/**
 * Default for new invitations: every permission selected.
 */
function defaultInvitePermissions() {
  return [...ALL_PERMISSION_VALUES];
}

/**
 * Resolve effective permissions for an admin document.
 * Legacy admins with missing/null permissions keep full access.
 * Explicit empty array means no capabilities.
 * @param {{ permissions?: string[] | null } | null | undefined} user
 * @returns {string[]}
 */
function resolveAdminPermissions(user) {
  if (!user || (user.role && user.role !== 'admin')) {
    return [];
  }
  if (user.permissions == null) {
    return [...ALL_PERMISSION_VALUES];
  }
  return normalizePermissions(user.permissions);
}

function hasPermission(userOrPerms, permission) {
  const list = Array.isArray(userOrPerms)
    ? userOrPerms
    : resolveAdminPermissions(userOrPerms);
  return list.includes(permission);
}

function hasAnyPermission(userOrPerms, permissions) {
  return permissions.some((p) => hasPermission(userOrPerms, p));
}

function hasAllPermissions(userOrPerms, permissions) {
  return permissions.every((p) => hasPermission(userOrPerms, p));
}

module.exports = {
  PERMISSIONS,
  ALL_PERMISSION_VALUES,
  PERMISSION_MODULES,
  normalizePermissions,
  defaultInvitePermissions,
  resolveAdminPermissions,
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
};
