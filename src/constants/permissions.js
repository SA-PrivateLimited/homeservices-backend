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

  /** Dedicated Partner bulk onboarding module (Excel paste → insert). */
  PARTNER_BULK_ONBOARDING_VIEW: 'partner-bulk-onboarding.view',
  PARTNER_BULK_ONBOARDING_UPDATE: 'partner-bulk-onboarding.update',

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

  CATEGORY_SECTIONS_VIEW: 'category-sections.view',
  CATEGORY_SECTIONS_CREATE: 'category-sections.create',
  CATEGORY_SECTIONS_UPDATE: 'category-sections.update',
  CATEGORY_SECTIONS_DELETE: 'category-sections.delete',

  GEOGRAPHY_VIEW: 'geography.view',
  GEOGRAPHY_UPDATE: 'geography.update',

  CONTACTS_VIEW: 'contacts.view',
  CONTACTS_UPDATE: 'contacts.update',

  FEEDBACKS_VIEW: 'feedbacks.view',
  FEEDBACKS_UPDATE: 'feedbacks.update',

  /** Admin settings hub (sidebar: Permissions). */
  SETTINGS_VIEW: 'settings.view',
  SETTINGS_UPDATE: 'settings.update',

  CLIENTS_VIEW: 'clients.view',
  CLIENTS_CREATE: 'clients.create',
  CLIENTS_UPDATE: 'clients.update',
  CLIENTS_DELETE: 'clients.delete',

  GREETING_VIEW: 'greeting.view',
  GREETING_UPDATE: 'greeting.update',

  /** Manage other admin accounts (invite / permissions). Super Admin elevation still required. */
  ADMINS_VIEW: 'admins.view',
  ADMINS_MANAGE: 'admins.manage',

  /** Internal HR — Akansho employees (not marketplace partners). */
  EMPLOYEES_VIEW: 'employees.view',
  EMPLOYEES_CREATE: 'employees.create',
  EMPLOYEES_UPDATE: 'employees.update',
  EMPLOYEES_SALARY: 'employees.salary',
  EMPLOYEES_DOCUMENTS: 'employees.documents',
  EMPLOYEES_ID_CARD: 'employees.id-card',
  EMPLOYEES_DEACTIVATE: 'employees.deactivate',
  EMPLOYEES_DELETE: 'employees.delete',
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
    id: 'partner-bulk-onboarding',
    label: 'Partner bulk onboarding',
    permissions: [
      PERMISSIONS.PARTNER_BULK_ONBOARDING_VIEW,
      PERMISSIONS.PARTNER_BULK_ONBOARDING_UPDATE,
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
    id: 'category-sections',
    label: 'Category sections',
    permissions: [
      PERMISSIONS.CATEGORY_SECTIONS_VIEW,
      PERMISSIONS.CATEGORY_SECTIONS_CREATE,
      PERMISSIONS.CATEGORY_SECTIONS_UPDATE,
      PERMISSIONS.CATEGORY_SECTIONS_DELETE,
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
    id: 'feedbacks',
    label: 'Feedbacks',
    permissions: [PERMISSIONS.FEEDBACKS_VIEW, PERMISSIONS.FEEDBACKS_UPDATE],
  },
  {
    id: 'settings',
    label: 'Permissions',
    permissions: [PERMISSIONS.SETTINGS_VIEW, PERMISSIONS.SETTINGS_UPDATE],
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
  {
    id: 'greeting',
    label: 'Greeting',
    permissions: [PERMISSIONS.GREETING_VIEW, PERMISSIONS.GREETING_UPDATE],
  },
  {
    id: 'employees',
    label: 'HR / Employees',
    permissions: [
      PERMISSIONS.EMPLOYEES_VIEW,
      PERMISSIONS.EMPLOYEES_CREATE,
      PERMISSIONS.EMPLOYEES_UPDATE,
      PERMISSIONS.EMPLOYEES_SALARY,
      PERMISSIONS.EMPLOYEES_DOCUMENTS,
      PERMISSIONS.EMPLOYEES_ID_CARD,
      PERMISSIONS.EMPLOYEES_DEACTIVATE,
      PERMISSIONS.EMPLOYEES_DELETE,
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

  // Edit without View is invalid — promote View whenever any mutation
  // permission for that module is present.
  for (const mod of PERMISSION_MODULES) {
    const view = mod.permissions.find((p) => p.endsWith('.view'));
    const edits = mod.permissions.filter((p) => !p.endsWith('.view'));
    if (!view || !edits.length) continue;
    if (edits.some((p) => seen.has(p)) && !seen.has(view)) {
      seen.add(view);
      out.push(view);
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
