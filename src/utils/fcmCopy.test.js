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

  it('builds waiting / accepted / in-progress / completed copy with service', () => {
    expect(customerRequestSent({serviceType: 'Cleaning'})).toEqual({
      title: 'Cleaning request sent',
      body: 'Your Cleaning request is waiting for a professional to accept it.',
    });
    expect(
      customerPartnerAccepted({
        providerName: 'Sandeep K Gupta',
        serviceType: 'Electrician',
      }),
    ).toEqual({
      title: 'Request accepted',
      body: 'Sandeep has accepted your Electrician request.',
    });
    expect(customerPartnerAccepted({})).toEqual({
      title: 'Request accepted',
      body: 'Your service request has been accepted.',
    });
    expect(
      customerWorkStarted({
        providerName: 'Sandeep K Gupta',
        serviceType: 'Electrician',
      }),
    ).toEqual({
      title: 'Service in progress',
      body: 'Sandeep has started your Electrician job.',
    });
    expect(
      customerJobCompleted({
        providerName: 'Sandeep K Gupta',
        serviceType: 'Electrician',
      }),
    ).toEqual({
      title: 'Service completed',
      body: 'Sandeep has completed your Electrician job. Tap to view details.',
    });
  });
});
