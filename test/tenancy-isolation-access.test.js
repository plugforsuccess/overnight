const fs = require('fs');

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

describe('tenancy isolation hardening coverage', () => {
  test('parent child routes enforce facility context', () => {
    const childrenRoute = read('src/app/api/children/route.ts');
    expect(childrenRoute).toContain('auth.activeFacilityId');
    expect(childrenRoute).toContain(".eq('facility_id', auth.activeFacilityId)");
  });

  test('parent reservation routes enforce facility context', () => {
    const reservationsRoute = read('src/app/api/reservations/route.ts');
    expect(reservationsRoute).toContain('auth.activeFacilityId');
    expect(reservationsRoute).toContain(".eq('facility_id', auth.activeFacilityId)");
  });

  test('facility admin/staff API path uses centralized admin auth + facility filters', () => {
    const adminPickupRoute = read('src/app/api/admin/pickup-verification/route.ts');
    expect(adminPickupRoute).toContain('checkAdmin(req)');
    expect(adminPickupRoute).toContain('admin.activeFacilityId');
    expect(adminPickupRoute).toContain(".eq('facility_id', admin.activeFacilityId)");
  });

  test('platform role checks exist in facility auth helper', () => {
    const facilityAuth = read('src/lib/facility-auth.ts');
    expect(facilityAuth).toContain('checkPlatformAdmin');
    expect(facilityAuth).toContain('checkPlatformSupport');
  });

  test('stripe checkout route carries facility context for tenant block lookup', () => {
    const stripeRoute = read('src/app/api/stripe/route.ts');
    expect(stripeRoute).toContain('authenticateParentForFacility');
    expect(stripeRoute).toContain(".eq('facility_id', facilitySession.activeFacilityId)");
  });
});
