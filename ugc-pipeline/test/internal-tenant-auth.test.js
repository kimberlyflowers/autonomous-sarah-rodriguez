const test = require('node:test');
const assert = require('node:assert/strict');
const { requireTenant } = require('../src/services/auth');
const fs = require('node:fs');
const path = require('node:path');

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('trusted service auth creates an isolated organization workspace', async () => {
  const req = {
    internalTenantAuth: true,
    headers: { 'x-tenant-slug': 'b2000000-0000-0000-0000-000000000002' },
    header(name) { return this.headers[String(name).toLowerCase()] || ''; },
    query: {},
    body: {}
  };
  const res = responseRecorder();
  let continued = false;
  await requireTenant(req, res, () => { continued = true; });
  assert.equal(continued, true);
  assert.equal(req.tenant.slug, 'b2000000-0000-0000-0000-000000000002');
  assert.equal(req.tenantRole, 'service');
});

test('trusted service auth refuses an omitted organization boundary', async () => {
  const req = {
    internalTenantAuth: true,
    header() { return ''; },
    query: {},
    body: {}
  };
  const res = responseRecorder();
  let continued = false;
  await requireTenant(req, res, () => { continued = true; });
  assert.equal(continued, false);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /X-Tenant-Slug/);
});

test('Studio job lookup authorizes durable tenant ownership before shared cache access', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'api', 'studio.js'), 'utf8');
  const routeStart = source.indexOf("router.get('/jobs/:requestId'");
  const route = source.slice(routeStart, routeStart + 3500);
  assert.ok(
    route.indexOf('getLocalVideoJobByRequest(tenantId') < route.indexOf('pollStudioJob(req.params.requestId)'),
    'tenant ownership must be checked before polling the shared provider cache'
  );
  assert.match(route, /if \(!row\) return res\.status\(404\)/);
});

test('browser image requests can reach signed tenant-session validation', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');
  const guardStart = source.indexOf('const apiKeyAuth =');
  const guard = source.slice(guardStart, guardStart + 1100);
  assert.match(guard, /req\.query\.token/);
  assert.match(guard, /req\.header\('X-UGC-Token'\)/);
  assert.match(source, /app\.use\('\/api\/assets', apiKeyAuth, requireTenant, assetsRouter\)/);
});
