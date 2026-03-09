#!/usr/bin/env tsx
/**
 * Route Hardening Audit Script — Overnight Platform
 *
 * Static-analysis heuristic scanner that discovers all pages and API routes,
 * classifies them by type, and flags missing hardening protections.
 *
 * Usage:
 *   npx tsx scripts/audit-route-hardening.ts
 *   npm run audit:routes
 *
 * Outputs:
 *   reports/route-hardening-audit.json
 *   reports/route-hardening-audit.md
 *
 * Known Limitations:
 *   - Static heuristics can miss indirect helper-based auth
 *   - Ownership may be enforced in called functions, not directly in file
 *   - False positives are acceptable if clearly labeled
 *   - This script is a safety net, not a replacement for code review
 */

import * as fs from 'fs';
import * as path from 'path';

// ─── Types ──────────────────────────────────────────────────────────────────

type RouteType =
  | 'public_page'
  | 'parent_page'
  | 'admin_page'
  | 'public_api'
  | 'parent_api'
  | 'admin_api'
  | 'internal_unknown';

type Severity = 'critical' | 'warning' | 'info';

type IssueType =
  | 'namespace_violation'
  | 'missing_auth_gate'
  | 'missing_ownership_validation'
  | 'missing_center_scoping'
  | 'missing_audit_logging'
  | 'sensitive_field_exposure'
  | 'missing_middleware_coverage'
  | 'inline_admin_auth';

interface Finding {
  route: string;
  file: string;
  routeType: RouteType;
  severity: Severity;
  issueType: IssueType;
  summary: string;
  evidence: string[];
  recommendedFix: string;
}

interface RouteInfo {
  filePath: string;      // absolute path
  relativePath: string;  // relative to src/app
  routePath: string;     // URL path
  fileType: 'page' | 'layout' | 'route';
  routeType: RouteType;
  content: string;
  httpMethods: string[];
  isDynamic: boolean;
  dynamicSegments: string[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const SRC_APP_DIR = path.resolve(__dirname, '..', 'src', 'app');
const MIDDLEWARE_PATH = path.resolve(__dirname, '..', 'src', 'middleware.ts');
const REPORTS_DIR = path.resolve(__dirname, '..', 'reports');

const PUBLIC_PAGE_PATHS = ['/', '/login', '/signup', '/pricing', '/policies'];
const AUTH_PAGE_PATHS = ['/login', '/signup'];

// Patterns to detect auth mechanisms
const ADMIN_AUTH_PATTERNS = [
  /checkAdmin\s*\(/,
  /checkStaff\s*\(/,
  /checkBilling\s*\(/,
  /checkAnyAdminRole\s*\(/,
  /checkAdminWithRole\s*\(/,
  /requireAdmin\s*\(/,
  /requireCenterRole\s*\(/,
  /is_admin/,
  /role\s*!==\s*['"]admin['"]/,
  /role\s*===\s*['"]admin['"]/,
  /parent\.role/,
  /Admin access required/,
];

const PARENT_AUTH_PATTERNS = [
  /authenticateRequest\s*\(/,
  /auth\.parentId/,
  /parentId/,
  /resolveParentId/,
  /supabase\.auth\.getUser/,
  /getUser\s*\(/,
];

const OWNERSHIP_PATTERNS = [
  /\.eq\s*\(\s*['"]parent_id['"]/,
  /children!inner\(parent_id\)/,
  /auth\.parentId/,
  /child\.parent_id/,
  /parent_id.*===.*auth/,
  /auth.*===.*parent_id/,
  /parentId.*===.*parent_id/,
  /parent_id.*!==.*auth/,
];

const AUDIT_LOG_PATTERNS = [
  /logAuditEvent/,
  /audit_log/,
  /reservation_events/,
  /attendance_events/,
  /capacity_override_events/,
  /event_type/,
  /\.insert\s*\(\s*\{[^}]*action/,
];

// Helper functions known to contain internal audit/event logging.
// When a route imports and calls these, audit logging is handled internally.
const KNOWN_LOGGING_HELPERS = [
  /from\s+['"]@\/lib\/attendance\/check-in['"]/,
  /from\s+['"]@\/lib\/attendance\/check-out['"]/,
  /from\s+['"]@\/lib\/attendance\/correct['"]/,
  /from\s+['"]@\/lib\/attendance\/mark-no-show['"]/,
  /from\s+['"]@\/lib\/closures\/apply['"]/,
  /from\s+['"]@\/lib\/closures\/reopen['"]/,
  /from\s+['"]@\/lib\/closures\/preview['"]/,
];

const SENSITIVE_FIELD_PATTERNS = [
  /['"]pin_hash['"]/,
  /['"]password['"]/,
  /['"]token['"]/,
  /['"]secret['"]/,
  /['"]service_role['"]/,
  /['"]privateKey['"]/,
  /['"]private_key['"]/,
  /select\s*\([^)]*pin_hash/,
  /select\s*\([^)]*password/,
];

const CENTER_SCOPING_PATTERNS = [
  /center_id/,
  /program_id/,
  /programId/,
  /program\.id/,
];

const HTTP_METHOD_EXPORTS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

// Sensitive admin mutations that must have audit logging
const SENSITIVE_ADMIN_MUTATIONS = [
  'closures',
  'attendance',
  'correct',
  'check-in',
  'check-out',
  'no-show',
  'waitlist-promote',
  'pickup-verification',
];

// ─── File Discovery ─────────────────────────────────────────────────────────

function discoverFiles(dir: string, pattern: RegExp): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...discoverFiles(fullPath, pattern));
    } else if (pattern.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

// ─── Route Path Derivation ──────────────────────────────────────────────────

function filePathToRoutePath(filePath: string): string {
  let rel = path.relative(SRC_APP_DIR, filePath);
  // Remove filename (handle both root-level and nested files)
  rel = rel.replace(/\/?(page|layout|route)\.(ts|tsx)$/, '');
  // Convert to URL path
  let routePath = '/' + rel.replace(/\\/g, '/');
  // Root route — when page.tsx is directly in src/app/
  if (routePath === '/.' || routePath === '/' || routePath === '') routePath = '/';
  return routePath;
}

function getFileType(filePath: string): 'page' | 'layout' | 'route' {
  if (filePath.endsWith('page.tsx') || filePath.endsWith('page.ts')) return 'page';
  if (filePath.endsWith('layout.tsx') || filePath.endsWith('layout.ts')) return 'layout';
  return 'route';
}

// ─── Route Classification ───────────────────────────────────────────────────

function classifyRoute(routePath: string, fileType: 'page' | 'layout' | 'route'): RouteType {
  if (fileType === 'route') {
    // API routes
    if (routePath.startsWith('/api/admin')) return 'admin_api';
    if (routePath.startsWith('/api/auth')) return 'public_api';
    if (routePath === '/api/stripe/webhook') return 'public_api';
    if (routePath.startsWith('/api')) return 'parent_api';
    return 'internal_unknown';
  }

  // UI pages and layouts
  if (routePath.startsWith('/admin')) return 'admin_page';
  if (routePath.startsWith('/dashboard') || routePath === '/schedule') return 'parent_page';
  if (PUBLIC_PAGE_PATHS.includes(routePath)) return 'public_page';

  return 'internal_unknown';
}

function getDynamicSegments(routePath: string): string[] {
  const matches = routePath.match(/\[[^\]]+\]/g);
  return matches || [];
}

function getHttpMethods(content: string): string[] {
  return HTTP_METHOD_EXPORTS.filter(method => {
    const regex = new RegExp(`export\\s+(async\\s+)?function\\s+${method}\\s*\\(`);
    return regex.test(content);
  });
}

// ─── Pattern Detection Helpers ──────────────────────────────────────────────

function matchesAny(content: string, patterns: RegExp[]): boolean {
  return patterns.some(p => p.test(content));
}

function getMatchingPatterns(content: string, patterns: RegExp[]): string[] {
  return patterns.filter(p => p.test(content)).map(p => p.source);
}

function hasMutationMethods(methods: string[]): boolean {
  return methods.some(m => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(m));
}

// ─── Middleware Analysis ────────────────────────────────────────────────────

function parseMiddlewareProtectedRoutes(): string[] {
  if (!fs.existsSync(MIDDLEWARE_PATH)) return [];
  const content = fs.readFileSync(MIDDLEWARE_PATH, 'utf-8');
  const match = content.match(/PROTECTED_ROUTES\s*=\s*\[([^\]]+)\]/);
  if (!match) return [];
  return match[1]
    .split(',')
    .map(s => s.trim().replace(/['"]/g, ''))
    .filter(Boolean);
}

// ─── Rule Engine ────────────────────────────────────────────────────────────

function runChecks(route: RouteInfo, protectedPrefixes: string[]): Finding[] {
  const findings: Finding[] = [];

  // ═══ A. Namespace Correctness ═══
  checkNamespaceCorrectness(route, findings);

  // ═══ B. Authentication Guard Presence ═══
  checkAuthGuard(route, findings);

  // ═══ C. Dynamic Route Ownership Validation ═══
  checkOwnershipValidation(route, findings);

  // ═══ D. Center / Tenant Scoping ═══
  checkCenterScoping(route, findings);

  // ═══ E. Mutation Audit Logging ═══
  checkAuditLogging(route, findings);

  // ═══ F. Sensitive Field Exposure ═══
  checkSensitiveFieldExposure(route, findings);

  // ═══ G. Middleware Coverage ═══
  checkMiddlewareCoverage(route, protectedPrefixes, findings);

  return findings;
}

// ── Check A: Namespace Correctness ──

function checkNamespaceCorrectness(route: RouteInfo, findings: Finding[]) {
  const { routePath, content, routeType } = route;

  // Admin-like route outside admin namespace
  if (routeType !== 'admin_api' && routeType !== 'admin_page') {
    const hasAdminAuth = matchesAny(content, [/checkAdmin\s*\(/, /checkStaff\s*\(/, /checkBilling\s*\(/, /checkAnyAdminRole\s*\(/, /requireAdmin\s*\(/]);
    const hasInlineAdminCheck = /role\s*!==\s*['"]admin['"]/.test(content) && /is_admin/.test(content);

    if (hasAdminAuth) {
      findings.push({
        route: routePath,
        file: route.relativePath,
        routeType,
        severity: 'critical',
        issueType: 'namespace_violation',
        summary: `Route uses checkAdmin() but is not under /api/admin/* namespace.`,
        evidence: ['checkAdmin() call found', `Route path: ${routePath}`],
        recommendedFix: 'Move this route under /api/admin/* or /admin/* namespace.',
      });
    } else if (hasInlineAdminCheck && route.fileType === 'route') {
      findings.push({
        route: routePath,
        file: route.relativePath,
        routeType,
        severity: 'warning',
        issueType: 'inline_admin_auth',
        summary: `Route has inline admin auth check instead of using checkAdmin() helper.`,
        evidence: ['Inline role/is_admin check found', `Route path: ${routePath}`],
        recommendedFix: 'Refactor to use checkAdmin() and consider moving under /api/admin/* namespace.',
      });
    }
  }

  // Route path contains "admin" but is outside admin namespace
  if (routePath.includes('admin') && !routePath.startsWith('/admin') && !routePath.startsWith('/api/admin')) {
    findings.push({
      route: routePath,
      file: route.relativePath,
      routeType,
      severity: 'warning',
      issueType: 'namespace_violation',
      summary: `Route path contains "admin" but is outside standard admin namespace.`,
      evidence: [`Route path: ${routePath}`],
      recommendedFix: 'Verify this is intentional, or move under /admin/* or /api/admin/*.',
    });
  }
}

// ── Check B: Authentication Guard ──

function checkAuthGuard(route: RouteInfo, findings: Finding[]) {
  const { routeType, content, routePath } = route;

  if (routeType === 'admin_api') {
    const hasAdminAuth = matchesAny(content, ADMIN_AUTH_PATTERNS);
    if (!hasAdminAuth) {
      findings.push({
        route: routePath,
        file: route.relativePath,
        routeType,
        severity: 'critical',
        issueType: 'missing_auth_gate',
        summary: `Admin API route has no detectable admin authentication check.`,
        evidence: ['No checkAdmin(), requireAdmin(), role/is_admin check found'],
        recommendedFix: 'Add checkAdmin(req) call at the start of each handler.',
      });
    }

    // Flag admin routes using inline auth instead of the shared admin-auth helpers
    const usesCheckAdmin = /check(?:Admin|Staff|Billing|AnyAdminRole|AdminWithRole)\s*\(/.test(content);
    const hasInlineAdminAuth = hasAdminAuth && !usesCheckAdmin;
    if (hasInlineAdminAuth) {
      findings.push({
        route: routePath,
        file: route.relativePath,
        routeType,
        severity: 'warning',
        issueType: 'inline_admin_auth',
        summary: `Admin API uses inline auth check instead of shared checkAdmin() helper.`,
        evidence: ['Inline role/is_admin verification found', 'checkAdmin() import not detected'],
        recommendedFix: 'Refactor to use the shared checkAdmin() helper from @/lib/admin-auth for consistency.',
      });
    }
  }

  if (routeType === 'admin_page' && route.fileType === 'page') {
    // Admin pages are protected by admin layout — check if layout exists
    // Individual pages may have client-side checks as defense-in-depth
    const hasAnyAuthRef = matchesAny(content, [
      ...ADMIN_AUTH_PATTERNS,
      /useEffect/,
      /createSupabaseServerClient/,
      /supabase/i,
    ]);
    // This is info-level since layout handles it
    if (!hasAnyAuthRef) {
      findings.push({
        route: routePath,
        file: route.relativePath,
        routeType,
        severity: 'info',
        issueType: 'missing_auth_gate',
        summary: `Admin page has no client-side defense-in-depth auth check (protected by layout).`,
        evidence: ['No auth-related code detected in page component'],
        recommendedFix: 'Consider adding client-side role check as defense-in-depth.',
      });
    }
  }

  if (routeType === 'parent_api') {
    const hasParentAuth = matchesAny(content, PARENT_AUTH_PATTERNS);
    if (!hasParentAuth) {
      findings.push({
        route: routePath,
        file: route.relativePath,
        routeType,
        severity: 'critical',
        issueType: 'missing_auth_gate',
        summary: `Parent API route has no detectable authentication check.`,
        evidence: ['No authenticateRequest(), getUser(), or parentId check found'],
        recommendedFix: 'Add authenticateRequest(req) call at the start of each handler.',
      });
    }
  }

  // Stripe webhook is exempt (uses signature verification)
  if (routeType === 'public_api' && routePath === '/api/stripe/webhook') {
    return;
  }

  if (routeType === 'parent_page' && route.fileType === 'page') {
    // Protected by dashboard layout — info only
    const hasAuthRef = matchesAny(content, [
      ...PARENT_AUTH_PATTERNS,
      /useEffect/,
      /createSupabaseServerClient/,
    ]);
    if (!hasAuthRef) {
      // This is fine — layout handles it
    }
  }
}

// ── Check C: Dynamic Route Ownership ──

function checkOwnershipValidation(route: RouteInfo, findings: Finding[]) {
  if (!route.isDynamic) return;
  if (route.routeType === 'admin_api' || route.routeType === 'admin_page') return;
  if (route.routeType === 'public_api' || route.routeType === 'public_page') return;
  if (route.fileType === 'layout') return;

  const hasOwnership = matchesAny(route.content, OWNERSHIP_PATTERNS);

  if (!hasOwnership && route.fileType === 'route') {
    findings.push({
      route: route.routePath,
      file: route.relativePath,
      routeType: route.routeType,
      severity: 'critical',
      issueType: 'missing_ownership_validation',
      summary: `Dynamic parent-facing route with no detectable ownership validation.`,
      evidence: [
        `Dynamic segments: ${route.dynamicSegments.join(', ')}`,
        'No .eq(\'parent_id\', ...), children!inner(parent_id), or auth.parentId comparison found',
      ],
      recommendedFix: 'Add ownership check: join through child ownership and validate auth.parentId.',
    });
  } else if (!hasOwnership && route.fileType === 'page') {
    findings.push({
      route: route.routePath,
      file: route.relativePath,
      routeType: route.routeType,
      severity: 'warning',
      issueType: 'missing_ownership_validation',
      summary: `Dynamic parent page with no detectable ownership check (may be handled by API).`,
      evidence: [
        `Dynamic segments: ${route.dynamicSegments.join(', ')}`,
        'No ownership pattern detected in page component',
      ],
      recommendedFix: 'Verify that the underlying API enforces ownership validation.',
    });
  }
}

// ── Check D: Center / Tenant Scoping ──

function checkCenterScoping(route: RouteInfo, findings: Finding[]) {
  if (route.routeType !== 'admin_api') return;
  if (route.fileType !== 'route') return;

  // Admin routes that operate on center-scoped data
  const centerScopedPaths = [
    '/api/admin/closures',
    '/api/admin/attendance',
    '/api/admin/waitlist-promote',
  ];

  const isCenterScoped = centerScopedPaths.some(p => route.routePath.startsWith(p));
  if (!isCenterScoped) return;

  const hasCenterScoping = matchesAny(route.content, CENTER_SCOPING_PATTERNS);
  if (!hasCenterScoping) {
    findings.push({
      route: route.routePath,
      file: route.relativePath,
      routeType: route.routeType,
      severity: 'warning',
      issueType: 'missing_center_scoping',
      summary: `Admin route operates on center-scoped data but no center/program scoping detected.`,
      evidence: ['No center_id, program_id, or programId reference found'],
      recommendedFix: 'Add center_id/program_id scoping when multi-center support is needed.',
    });
  }
}

// ── Check E: Mutation Audit Logging ──

function checkAuditLogging(route: RouteInfo, findings: Finding[]) {
  if (route.fileType !== 'route') return;
  if (!hasMutationMethods(route.httpMethods)) return;

  const hasAuditLog = matchesAny(route.content, AUDIT_LOG_PATTERNS);
  if (hasAuditLog) return;

  // Check if route delegates to helper functions that handle logging internally
  const delegatesToLoggingHelper = matchesAny(route.content, KNOWN_LOGGING_HELPERS);
  if (delegatesToLoggingHelper) return;

  const isSensitiveAdmin = route.routeType === 'admin_api' &&
    SENSITIVE_ADMIN_MUTATIONS.some(s => route.routePath.includes(s));

  if (isSensitiveAdmin) {
    findings.push({
      route: route.routePath,
      file: route.relativePath,
      routeType: route.routeType,
      severity: 'critical',
      issueType: 'missing_audit_logging',
      summary: `Sensitive admin mutation route has no detectable audit/event logging.`,
      evidence: [
        `HTTP methods: ${route.httpMethods.join(', ')}`,
        'No logAuditEvent, audit_log, or event table insert found',
      ],
      recommendedFix: 'Add audit logging via logAuditEvent() or event table insert for traceability.',
    });
  } else if (route.routeType === 'parent_api') {
    // Only flag parent APIs that are clearly mutations
    const significantMutations = route.httpMethods.filter(m => ['POST', 'DELETE', 'PATCH'].includes(m));
    if (significantMutations.length > 0) {
      findings.push({
        route: route.routePath,
        file: route.relativePath,
        routeType: route.routeType,
        severity: 'warning',
        issueType: 'missing_audit_logging',
        summary: `Mutation route has no detectable audit/event logging.`,
        evidence: [
          `HTTP methods with mutations: ${significantMutations.join(', ')}`,
          'No logAuditEvent, audit_log, or event table insert found',
        ],
        recommendedFix: 'Consider adding audit logging for important mutations.',
      });
    }
  }
}

// ── Check F: Sensitive Field Exposure ──

function checkSensitiveFieldExposure(route: RouteInfo, findings: Finding[]) {
  if (route.fileType !== 'route') return;

  const matchedPatterns = getMatchingPatterns(route.content, SENSITIVE_FIELD_PATTERNS);
  if (matchedPatterns.length > 0) {
    // Check for false positives:
    // - hashing or comparing pins/passwords (verification logic)
    // - Zod schema validation of incoming password fields (not exposure)
    // - Supabase Auth admin API password updates (server-side, not exposed)
    const isVerificationContext = /bcrypt|hash|compare|verify/.test(route.content);
    const isSchemaValidation = /z\.object|z\.string|Schema\s*=\s*z\./.test(route.content) &&
      /new_password|confirm_password|passwordSchema/.test(route.content);
    const isAuthAdminUpdate = /auth\.admin\.updateUserById/.test(route.content);

    const isLikelyFalsePositive = isVerificationContext || isSchemaValidation || isAuthAdminUpdate;

    // Check if the field appears in a .select() call (potential data exposure)
    // But if it's fetched for server-side verification (bcrypt compare), it's not exposure
    const inSelectCall = /\.select\s*\([^)]*(?:pin_hash|password|secret|service_role|privateKey)/.test(route.content);
    const fetchedForVerification = inSelectCall && isVerificationContext;

    const severity: Severity = (inSelectCall && !fetchedForVerification) ? 'critical' :
      isLikelyFalsePositive ? 'info' : 'warning';

    const fpNote = isLikelyFalsePositive
      ? ' (likely false positive — field appears used for validation/verification, not in API response)'
      : '';

    findings.push({
      route: route.routePath,
      file: route.relativePath,
      routeType: route.routeType,
      severity,
      issueType: 'sensitive_field_exposure',
      summary: `Possible sensitive field exposure detected${fpNote}.`,
      evidence: matchedPatterns.map(p => `Pattern matched: ${p}`),
      recommendedFix: 'Verify sensitive fields are not included in API responses. Use .select() to exclude them.',
    });
  }
}

// ── Check G: Middleware Coverage ──

function checkMiddlewareCoverage(route: RouteInfo, protectedPrefixes: string[], findings: Finding[]) {
  if (route.fileType !== 'page' && route.fileType !== 'layout') return;
  if (route.routeType === 'public_page') return;

  const expectedProtectedPrefixes: Record<string, string[]> = {
    'admin_page': ['/admin'],
    'parent_page': ['/dashboard', '/schedule'],
  };

  const expected = expectedProtectedPrefixes[route.routeType];
  if (!expected) return;

  for (const prefix of expected) {
    if (route.routePath.startsWith(prefix) && !protectedPrefixes.some(p => prefix.startsWith(p))) {
      findings.push({
        route: route.routePath,
        file: route.relativePath,
        routeType: route.routeType,
        severity: 'critical',
        issueType: 'missing_middleware_coverage',
        summary: `Route prefix "${prefix}" is not in middleware PROTECTED_ROUTES.`,
        evidence: [
          `Expected prefix: ${prefix}`,
          `Current PROTECTED_ROUTES: [${protectedPrefixes.join(', ')}]`,
        ],
        recommendedFix: `Add "${prefix}" to PROTECTED_ROUTES in src/middleware.ts.`,
      });
    }
  }
}

// ─── Report Generation ──────────────────────────────────────────────────────

function generateJsonReport(routes: RouteInfo[], findings: Finding[]) {
  const summary = {
    generatedAt: new Date().toISOString(),
    totalRoutes: routes.length,
    totalFindings: findings.length,
    bySeverity: {
      critical: findings.filter(f => f.severity === 'critical').length,
      warning: findings.filter(f => f.severity === 'warning').length,
      info: findings.filter(f => f.severity === 'info').length,
    },
    byRouteType: {} as Record<string, number>,
    byIssueType: {} as Record<string, number>,
  };

  for (const r of routes) {
    summary.byRouteType[r.routeType] = (summary.byRouteType[r.routeType] || 0) + 1;
  }
  for (const f of findings) {
    summary.byIssueType[f.issueType] = (summary.byIssueType[f.issueType] || 0) + 1;
  }

  return {
    summary,
    routes: routes.map(r => ({
      route: r.routePath,
      file: r.relativePath,
      fileType: r.fileType,
      routeType: r.routeType,
      httpMethods: r.httpMethods,
      isDynamic: r.isDynamic,
      dynamicSegments: r.dynamicSegments,
    })),
    findings,
  };
}

function generateMarkdownReport(routes: RouteInfo[], findings: Finding[]): string {
  const critical = findings.filter(f => f.severity === 'critical');
  const warning = findings.filter(f => f.severity === 'warning');
  const info = findings.filter(f => f.severity === 'info');

  const routeTypeCounts: Record<string, number> = {};
  for (const r of routes) {
    routeTypeCounts[r.routeType] = (routeTypeCounts[r.routeType] || 0) + 1;
  }

  const issueTypeCounts: Record<string, number> = {};
  for (const f of findings) {
    issueTypeCounts[f.issueType] = (issueTypeCounts[f.issueType] || 0) + 1;
  }

  let md = `# Route Hardening Audit Report

Generated: ${new Date().toISOString()}

## Summary

| Metric | Count |
|--------|-------|
| Total routes scanned | ${routes.length} |
| Total findings | ${findings.length} |
| Critical | ${critical.length} |
| Warning | ${warning.length} |
| Info | ${info.length} |

## Route Inventory

| Route Type | Count |
|------------|-------|
${Object.entries(routeTypeCounts).map(([type, count]) => `| ${type} | ${count} |`).join('\n')}

## Findings by Issue Type

| Issue Type | Count |
|------------|-------|
${Object.entries(issueTypeCounts).map(([type, count]) => `| ${type} | ${count} |`).join('\n')}

`;

  if (critical.length > 0) {
    md += `## Critical Findings

${critical.map(f => formatFindingMd(f)).join('\n---\n\n')}

`;
  } else {
    md += `## Critical Findings

None — all critical checks passed.

`;
  }

  if (warning.length > 0) {
    md += `## Warning Findings

${warning.map(f => formatFindingMd(f)).join('\n---\n\n')}

`;
  } else {
    md += `## Warning Findings

None.

`;
  }

  if (info.length > 0) {
    md += `## Info Findings

${info.map(f => formatFindingMd(f)).join('\n---\n\n')}

`;
  } else {
    md += `## Info Findings

None.

`;
  }

  md += `## All Routes

| Route | Type | File | Dynamic | Methods |
|-------|------|------|---------|---------|
${routes.map(r =>
  `| \`${r.routePath}\` | ${r.routeType} | ${r.relativePath} | ${r.isDynamic ? r.dynamicSegments.join(', ') : '-'} | ${r.httpMethods.join(', ') || '-'} |`
).join('\n')}

## Known Limitations

- Static heuristics can miss indirect helper-based auth (e.g., auth in called utility functions)
- Ownership may be enforced in called functions, not directly in the scanned file
- False positives are acceptable and labeled where detected
- Center/tenant scoping warnings reflect single-center deployment — not active vulnerabilities
- This script is a safety net, not a replacement for code review

## Methodology

This report was generated by \`scripts/audit-route-hardening.ts\`, a static heuristic scanner that:

1. Discovers all \`page.tsx\`, \`layout.tsx\`, and \`route.ts\` files under \`src/app/\`
2. Derives URL paths from filesystem paths
3. Classifies routes by type (public, parent, admin)
4. Applies regex-based heuristic checks for auth, ownership, audit logging, sensitive fields, and namespace correctness
5. Compares route prefixes against middleware PROTECTED_ROUTES
`;

  return md;
}

function formatFindingMd(f: Finding): string {
  return `### \`${f.route}\`
- **File:** \`${f.file}\`
- **Route Type:** ${f.routeType}
- **Severity:** ${f.severity.toUpperCase()}
- **Issue:** ${f.issueType}
- **Summary:** ${f.summary}
- **Evidence:**
${f.evidence.map(e => `  - ${e}`).join('\n')}
- **Recommended Fix:** ${f.recommendedFix}
`;
}

// ─── Main ───────────────────────────────────────────────────────────────────

function main() {
  console.log('Route Hardening Audit — Overnight Platform');
  console.log('==========================================\n');

  // Step 1: Discover files
  const pageFiles = discoverFiles(SRC_APP_DIR, /^page\.(tsx|ts)$/);
  const layoutFiles = discoverFiles(SRC_APP_DIR, /^layout\.(tsx|ts)$/);
  const routeFiles = discoverFiles(SRC_APP_DIR, /^route\.(tsx|ts)$/);

  // Exclude root layout (it's structural, not a route)
  const nonRootLayouts = layoutFiles.filter(f => {
    const rel = path.relative(SRC_APP_DIR, f);
    return rel !== 'layout.tsx' && rel !== 'layout.ts';
  });

  const allFiles = [...pageFiles, ...nonRootLayouts, ...routeFiles];

  console.log(`Discovered: ${pageFiles.length} pages, ${nonRootLayouts.length} layouts, ${routeFiles.length} API routes`);
  console.log(`Total files to audit: ${allFiles.length}\n`);

  // Step 2-3: Build route info
  const routes: RouteInfo[] = allFiles.map(filePath => {
    const relativePath = path.relative(path.resolve(__dirname, '..'), filePath);
    const routePath = filePathToRoutePath(filePath);
    const fileType = getFileType(filePath);
    const content = fs.readFileSync(filePath, 'utf-8');
    const routeType = classifyRoute(routePath, fileType);
    const dynamicSegments = getDynamicSegments(routePath);
    const httpMethods = fileType === 'route' ? getHttpMethods(content) : [];

    return {
      filePath,
      relativePath,
      routePath,
      fileType,
      routeType,
      content,
      httpMethods,
      isDynamic: dynamicSegments.length > 0,
      dynamicSegments,
    };
  });

  // Sort routes for consistent output
  routes.sort((a, b) => a.routePath.localeCompare(b.routePath));

  // Step 4: Parse middleware
  const protectedPrefixes = parseMiddlewareProtectedRoutes();
  console.log(`Middleware PROTECTED_ROUTES: [${protectedPrefixes.join(', ')}]\n`);

  // Step 5: Run checks
  const allFindings: Finding[] = [];
  for (const route of routes) {
    const findings = runChecks(route, protectedPrefixes);
    allFindings.push(...findings);
  }

  // Deduplicate findings (same route + same issueType)
  const seen = new Set<string>();
  const deduped = allFindings.filter(f => {
    const key = `${f.route}::${f.issueType}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Step 6: Generate reports
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const jsonReport = generateJsonReport(routes, deduped);
  const jsonPath = path.join(REPORTS_DIR, 'route-hardening-audit.json');
  fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2));

  const mdReport = generateMarkdownReport(routes, deduped);
  const mdPath = path.join(REPORTS_DIR, 'route-hardening-audit.md');
  fs.writeFileSync(mdPath, mdReport);

  // Console summary
  const critical = deduped.filter(f => f.severity === 'critical');
  const warning = deduped.filter(f => f.severity === 'warning');
  const info = deduped.filter(f => f.severity === 'info');

  console.log(`Findings: ${critical.length} critical, ${warning.length} warning, ${info.length} info`);

  if (critical.length > 0) {
    console.log('\n--- CRITICAL FINDINGS ---');
    for (const f of critical) {
      console.log(`  [CRITICAL] ${f.route} — ${f.summary}`);
    }
  }

  if (warning.length > 0) {
    console.log('\n--- WARNING FINDINGS ---');
    for (const f of warning) {
      console.log(`  [WARNING] ${f.route} — ${f.summary}`);
    }
  }

  console.log(`\nReports written to:`);
  console.log(`  JSON: ${jsonPath}`);
  console.log(`  Markdown: ${mdPath}`);

  // Exit with non-zero if critical findings
  if (critical.length > 0) {
    console.log(`\nAudit FAILED: ${critical.length} critical finding(s) require attention.`);
    process.exit(1);
  } else {
    console.log(`\nAudit PASSED: No critical findings.`);
    process.exit(0);
  }
}

main();
