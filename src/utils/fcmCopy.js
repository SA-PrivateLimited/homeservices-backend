/**
 * Short FCM title/body for the lock-screen banner.
 *
 * iOS appends "from Akansho" (Customer PWA) or "from Akansho Partner".
 * Titles must still make sense after that suffix — prefer a status label,
 * not a sentence that "from …" attaches to as the actor.
 */

function clip(text, max = 80) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  if (!value) return '';
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function firstName(fullName) {
  const raw = String(fullName || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const token = raw.split(' ')[0] || '';
  return token.replace(
    /^[^A-Za-z0-9\u0900-\u097F]+|[^A-Za-z0-9\u0900-\u097F]+$/g,
    '',
  );
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

/** Customer: request created / waiting for provider (pending). */
function customerRequestSent({serviceType} = {}) {
  const service = clip(serviceType, 40);
  return {
    title: service ? `${service} request sent` : 'Service request sent',
    body: 'Your request is waiting for a professional to accept it.',
  };
}

function customerPartnerAccepted({providerName, serviceType} = {}) {
  const who = firstName(providerName);
  return {
    title: 'Request accepted',
    body: who
      ? `${who} has accepted your service request.`
      : 'Your service request has been accepted.',
  };
}

function customerWorkStarted({providerName, serviceType, pin} = {}) {
  const who = firstName(providerName);
  return {
    title: 'Service in progress',
    body: who
      ? `Your service with ${who} is now in progress.`
      : 'Your service is now in progress.',
  };
}

function customerJobCompleted({providerName, serviceType} = {}) {
  const who = firstName(providerName);
  return {
    title: 'Service completed',
    body: who
      ? `Your service with ${who} has been completed. Tap to view details.`
      : 'Your service has been completed. Tap to view details.',
  };
}

function customerJobCancelled({providerName, serviceType, reason} = {}) {
  const who = firstName(providerName) || clip(providerName, 40) || 'Your partner';
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
  firstName,
  partnerNewJob,
  partnerJobUpdated,
  partnerJobCancelled,
  customerRequestSent,
  customerPartnerAccepted,
  customerWorkStarted,
  customerJobCompleted,
  customerJobCancelled,
  customerPartnerDeclined,
};
