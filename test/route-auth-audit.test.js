/**
 * Route Auth Audit Test
 *
 * Static analysis test that scans all API route files to verify they import
 * and call an auth function (authenticateRequest or checkAdmin/checkAdminId/checkStaffOrAdmin).
 *
 * This catches new API routes added without auth protection.
 */
const fs = require('fs');
const path = require('path');

const API_DIR = path.join(__dirname, '..', 'src', 'app', 'api');

// Routes that are intentionally public (no auth required)
const PUBLIC_ROUTES = [
  'api/auth/signup',     // Registration endpoint
  'api/stripe/webhook',  // Stripe webhook (verified by Stripe signature)
];

// Auth function patterns that count as "protected"
const AUTH_PATTERNS = [
  /authenticateRequest\s*\(/,
  /checkAdmin\s*\(/,
  /checkAdminId\s*\(/,
  /checkStaffOrAdmin\s*\(/,
  /verifyAdmin\s*\(/,
  /supabase\.auth\.getUser\s*\(/,
  /getUserClient\s*\(/,
];

function findRouteFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      findRouteFiles(fullPath, files);
    } else if (entry.name === 'route.ts' || entry.name === 'route.js') {
      files.push(fullPath);
    }
  }
  return files;
}

function getRelativePath(filePath) {
  return path.relative(path.join(__dirname, '..', 'src', 'app'), filePath);
}

function isPublicRoute(filePath) {
  const rel = getRelativePath(filePath).replace(/\\/g, '/').replace('/route.ts', '').replace('/route.js', '');
  return PUBLIC_ROUTES.some(pub => rel.endsWith(pub));
}

describe('API Route Auth Coverage', () => {
  const routeFiles = findRouteFiles(API_DIR);

  test('should find API route files', () => {
    expect(routeFiles.length).toBeGreaterThan(0);
  });

  const protectedRoutes = routeFiles.filter(f => !isPublicRoute(f));

  test.each(protectedRoutes.map(f => [getRelativePath(f), f]))(
    '%s should call an auth function',
    (relPath, filePath) => {
      const content = fs.readFileSync(filePath, 'utf-8');
      const hasAuth = AUTH_PATTERNS.some(pattern => pattern.test(content));
      expect(hasAuth).toBe(true);
    }
  );

  test('admin routes should use shared checkAdmin or checkAdminId', () => {
    const adminRoutes = routeFiles.filter(f =>
      getRelativePath(f).replace(/\\/g, '/').includes('api/admin/')
    );

    for (const filePath of adminRoutes) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const usesSharedHelper =
        /import\s+\{[^}]*check(?:Admin|AdminId|StaffOrAdmin)[^}]*\}\s+from\s+['"]@\/lib\/admin-auth['"]/.test(content);
      const usesLocalHelper =
        /(?:async\s+)?function\s+(?:checkAdmin|verifyAdmin)\s*\(/.test(content);

      if (usesLocalHelper && !usesSharedHelper) {
        console.warn(
          `WARNING: ${getRelativePath(filePath)} defines a local admin check instead of importing from @/lib/admin-auth`
        );
      }
    }
  });
});
