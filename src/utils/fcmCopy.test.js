const {
  firstName,
  customerRequestSent,
  customerPartnerAccepted,
  customerWorkStarted,
  customerJobCompleted,
} = require('./fcmCopy');

describe('fcmCopy customer status messages', () => {
  it('extracts first name', () => {
    expect(firstName('Sandeep K Gupta')).toBe('Sandeep');
  });

  it('builds waiting / accepted / in-progress / completed copy', () => {
    expect(customerRequestSent({serviceType: 'Cleaning'})).toEqual({
      title: 'Cleaning request sent',
      body: 'Your request is waiting for a professional to accept it.',
    });
    expect(
      customerPartnerAccepted({providerName: 'Sandeep K Gupta'}),
    ).toEqual({
      title: 'Request accepted',
      body: 'Sandeep has accepted your service request.',
    });
    expect(customerPartnerAccepted({})).toEqual({
      title: 'Request accepted',
      body: 'Your service request has been accepted.',
    });
    expect(
      customerWorkStarted({providerName: 'Sandeep K Gupta'}),
    ).toEqual({
      title: 'Service in progress',
      body: 'Your service with Sandeep is now in progress.',
    });
    expect(
      customerJobCompleted({providerName: 'Sandeep K Gupta'}),
    ).toEqual({
      title: 'Service completed',
      body: 'Your service with Sandeep has been completed. Tap to view details.',
    });
  });
});
