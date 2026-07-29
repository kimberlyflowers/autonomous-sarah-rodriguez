import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveVideoPlanTier } from '../src/tools/video-mcp-tools.js';

function supabaseReturning(plan, error = null) {
  return {
    from(table) {
      assert.equal(table, 'organizations');
      return {
        select(columns) {
          assert.equal(columns, 'plan');
          return {
            eq(field, organizationId) {
              assert.equal(field, 'id');
              assert.ok(organizationId);
              return {
                async maybeSingle() {
                  return { data: plan ? { plan } : null, error };
                },
              };
            },
          };
        },
      };
    },
  };
}

test('enterprise organizations receive full video access', async () => {
  const tier = await resolveVideoPlanTier('org-enterprise', {
    supabase: supabaseReturning('enterprise'),
  });
  assert.equal(tier, 'video_pro');
});

test('pro organizations receive creator video access', async () => {
  const tier = await resolveVideoPlanTier('org-pro', {
    supabase: supabaseReturning('pro'),
  });
  assert.equal(tier, 'video_creator');
});

test('missing organization context cannot self-assert a paid tier', async () => {
  assert.equal(await resolveVideoPlanTier(null), 'free');
});

test('database lookup failures fail closed', async () => {
  const tier = await resolveVideoPlanTier('org-error', {
    supabase: supabaseReturning(null, new Error('lookup failed')),
  });
  assert.equal(tier, 'free');
});
