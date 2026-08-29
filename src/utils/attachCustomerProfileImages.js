/**
 * Attach customer profile photo URLs to job cards / service requests for provider views.
 */

const User = require('../models/User');

function pickProfileImage(user) {
  if (!user) return undefined;
  const url = String(user.profileImage || user.photoURL || '').trim();
  return url || undefined;
}

/**
 * @param {Array<object>} items
 * @param {object} [opts]
 * @param {string} [opts.idField='customerId']
 * @param {string} [opts.targetField='customerProfileImage']
 * @returns {Promise<Array<object>>}
 */
async function attachCustomerProfileImages(
  items,
  {idField = 'customerId', targetField = 'customerProfileImage'} = {},
) {
  if (!Array.isArray(items) || !items.length) return items || [];

  const ids = [
    ...new Set(
      items
        .map((item) => String(item?.[idField] || '').trim())
        .filter(Boolean),
    ),
  ];
  if (!ids.length) return items;

  const users = await User.find({_id: {$in: ids}})
    .select('_id profileImage photoURL')
    .lean();

  const byId = new Map(
    users.map((user) => [String(user._id), pickProfileImage(user)]),
  );

  return items.map((item) => {
    const photo = byId.get(String(item?.[idField] || '').trim());
    if (!photo) return item;
    return {...item, [targetField]: photo};
  });
}

module.exports = {
  attachCustomerProfileImages,
  pickProfileImage,
};
