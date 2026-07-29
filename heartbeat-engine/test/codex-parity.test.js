import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCodexStyleOpening,
  classifyToolFailure,
  instructionExplicitlyAuthorizesConsequence,
  shouldClarifyBeforeWork,
  validateExactPurchaseAuthorization,
  validateMutationTarget,
} from '../src/orchestrator/autonomy-policy.js';

test('discoverable ambiguity does not create a user gate', () => {
  assert.equal(shouldClarifyBeforeWork({ discoverable: true, materiallyChangesScope: true }), false);
});

test('material authority expansion requires one clarification', () => {
  assert.equal(shouldClarifyBeforeWork({ requiresNewAuthority: true }), true);
  assert.equal(shouldClarifyBeforeWork({ missingExternalTarget: true }), true);
});

test('substantial engineering opening states approach and scope preservation', () => {
  const opening = buildCodexStyleOpening('Edit my GitHub repository and deploy it to Vercel');
  assert.match(opening, /inspect the real repository/i);
  assert.match(opening, /preserve unrelated files/i);
  assert.match(opening, /verify the live result/i);
});

test('read-only repository opening does not promise a code change', () => {
  const opening = buildCodexStyleOpening('Read-only: inspect this GitHub repository. Do not modify, commit, or deploy anything.');
  assert.match(opening, /without modifying, committing, or deploying/i);
  assert.doesNotMatch(opening, /make the smallest requested change/i);
});

test('browser opening refuses unverified success claims', () => {
  assert.match(buildCodexStyleOpening('Log in and upload this in the browser'), /won’t claim access or success/i);
});

test('creative work proceeds through reversible choices without pausing', () => {
  assert.match(buildCodexStyleOpening('Create a branded presentation'), /without pausing for choices I can safely make/i);
});

test('corrective failures are not classified for identical retry', () => {
  assert.equal(classifyToolFailure({ success: false, error: '404 index.html not found' }), 'corrective');
});

test('transient failures are eligible for controlled retry', () => {
  assert.equal(classifyToolFailure({ success: false, error: '503 temporary timeout' }), 'transient');
});

test('pending external state is neither retry failure nor terminal failure', () => {
  assert.equal(classifyToolFailure({ success: false, status: 'timeout', pending: true }), 'pending');
});

test('consequential mutations require an exact target', () => {
  const missing = validateMutationTarget('bloom_delete_file', {});
  assert.equal(missing.allowed, false);
  assert.match(missing.error, /exact target identifier/i);
  assert.equal(validateMutationTarget('bloom_delete_file', { path: '/tenant/report.pdf' }).allowed, true);
});

test('authenticated owner is a resolved communication target', () => {
  const result = validateMutationTarget('ghl_call_owner', {});
  assert.equal(result.allowed, true);
  assert.equal(result.targetField, 'authenticated_owner');
});

test('explicit consequential authorization is recognized across conversation context', () => {
  assert.equal(instructionExplicitlyAuthorizesConsequence('Please delete task 123'), true);
  assert.equal(instructionExplicitlyAuthorizesConsequence('Just review task 123'), false);
});

test('ordinary read-only tools do not require consequential authorization', () => {
  assert.deepEqual(validateMutationTarget('github_get_repository', {}), { allowed: true, consequential: false });
});

test('Uber Eats payment authorization must match the current restaurant and exact total', () => {
  const purchase = { restaurant: 'Flower Cafe', total: 27.43 };
  assert.equal(
    validateExactPurchaseAuthorization(
      'Answer to "Place the Flower Cafe order totaling $27.43?": Approve $27.43 payment',
      purchase,
    ).authorized,
    true,
  );
  assert.equal(
    validateExactPurchaseAuthorization('Yes, place it', purchase).authorized,
    false,
  );
  assert.equal(
    validateExactPurchaseAuthorization('Approve the Flower Cafe payment of $28.43', purchase).authorized,
    false,
  );
  assert.equal(
    validateExactPurchaseAuthorization('Approve the Other Cafe payment of $27.43', purchase).authorized,
    false,
  );
});
