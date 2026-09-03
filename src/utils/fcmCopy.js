/**
 * Short FCM title/body for the lock-screen banner.
 *
 * iOS appends "from Akanso" (Customer PWA) or "from Akanso Partner".
 * Titles must still make sense after that suffix — prefer a status label,
 * not a sentence that "from …" attaches to as the actor.
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
    title: 'New job update',
    body: `${clip(customerName, 40) || 'A customer'} needs ${service} near you`,
  };
}

function partnerJobUpdated({customerName, serviceType} = {}) {
  const service = clip(serviceType, 40) || 'service';
  return {
    title: 'Job details update',
    body: `${clip(customerName, 40) || 'A customer'} updated the ${service} job`,
  };
}

function partnerJobCancelled({customerName, serviceType, reason} = {}) {
  const who = clip(customerName, 40) || 'The customer';
  const service = clip(serviceType, 40) || 'service';
  const reasonText = clip(reason, 70);
  return {
    title: 'Job Cancelled update',
    body: reasonText
      ? `${who} cancelled the ${service} job. Reason: ${reasonText}`
      : `${who} cancelled the ${service} job.`,
  };
}

function customerPartnerAccepted({providerName, serviceType} = {}) {
  const who = clip(providerName, 40) || 'A partner';
  const service = clip(serviceType, 40) || 'service';
  return {
    title: 'Job accepted update',
    body: `${who} accepted your ${service} job.`,
  };
}

function customerWorkStarted({providerName, serviceType, pin} = {}) {
  const who = clip(providerName, 40) || 'Your partner';
  const service = clip(serviceType, 40) || 'service';
  const pinText = clip(pin, 12);
  return {
    title: 'Work started update',
    body: pinText
      ? `${who} started your ${service} job. PIN: ${pinText}`
      : `${who} started your ${service} job.`,
  };
}

function customerJobCompleted({providerName, serviceType} = {}) {
  const who = clip(providerName, 40) || 'Your partner';
  const service = clip(serviceType, 40) || 'service';
  return {
    title: 'Job completed update',
    body: `${who} completed your ${service} job.`,
  };
}

function customerJobCancelled({providerName, serviceType, reason} = {}) {
  const who = clip(providerName, 40) || 'Your partner';
  const service = clip(serviceType, 40) || 'service';
  const reasonText = clip(reason, 70);
  return {
    title: 'Job cancelled update',
    body: reasonText
      ? `${who} cancelled your ${service} job. Reason: ${reasonText}`
      : `${who} cancelled your ${service} job.`,
  };
}

function customerPartnerDeclined({reason} = {}) {
  return {
    title: 'Partner not available update',
    body: clip(reason, 100) || 'A partner could not take this job.',
  };
}

module.exports = {
  partnerNewJob,
  partnerJobUpdated,
  partnerJobCancelled,
  customerPartnerAccepted,
  customerWorkStarted,
  customerJobCompleted,
  customerJobCancelled,
  customerPartnerDeclined,
};
