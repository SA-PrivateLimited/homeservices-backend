/**
 * Short FCM title/body for the lock-screen banner.
 * Keep titles short: iOS often appends the PWA name ("from Partner").
 */

function clip(text, max = 80) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value) return '';
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function partnerNewJob({customerName, serviceType} = {}) {
  const service = clip(serviceType, 40) || 'help';
  return {
    title: 'New job nearby',
    body: `${clip(customerName, 40) || 'A customer'} needs ${service} near you`,
  };
}

function partnerJobUpdated({customerName, serviceType} = {}) {
  const service = clip(serviceType, 40) || 'service';
  return {
    title: 'Job updated',
    body: `${clip(customerName, 40) || 'A customer'} updated the ${service} job`,
  };
}

function partnerJobCancelled({customerName, serviceType, reason} = {}) {
  const who = clip(customerName, 40) || 'The customer';
  const service = clip(serviceType, 40) || 'service';
  const reasonText = clip(reason, 70);
  return {
    title: 'Job cancelled',
    body: reasonText
      ? `${who} cancelled the ${service} job. Reason: ${reasonText}`
      : `${who} cancelled the ${service} job.`,
  };
}

function customerPartnerAccepted({providerName, serviceType} = {}) {
  const who = clip(providerName, 40) || 'A partner';
  const service = clip(serviceType, 40) || 'service';
  return {
    title: 'Partner accepted',
    body: `${who} accepted your ${service} job.`,
  };
}

function customerWorkStarted({providerName, serviceType, pin} = {}) {
  const who = clip(providerName, 40) || 'Your partner';
  const service = clip(serviceType, 40) || 'service';
  const pinText = clip(pin, 12);
  return {
    title: 'Work started',
    body: pinText
      ? `${who} started your ${service} job. PIN: ${pinText}`
      : `${who} started your ${service} job.`,
  };
}

function customerJobCompleted({providerName, serviceType} = {}) {
  const who = clip(providerName, 40) || 'Your partner';
  const service = clip(serviceType, 40) || 'service';
  return {
    title: 'Job completed',
    body: `${who} completed your ${service} job.`,
  };
}

module.exports = {
  partnerNewJob,
  partnerJobUpdated,
  partnerJobCancelled,
  customerPartnerAccepted,
  customerWorkStarted,
  customerJobCompleted,
};
