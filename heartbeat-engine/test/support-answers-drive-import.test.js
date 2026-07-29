import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const adminApi = fs.readFileSync(new URL('../src/api/bloomie-admin.js', import.meta.url), 'utf8');
const filesApi = fs.readFileSync(new URL('../src/api/files.js', import.meta.url), 'utf8');
const adminUi = fs.readFileSync(new URL('../dashboard/src/components/BloomieAdmin.jsx', import.meta.url), 'utf8');
const referenceUi = fs.readFileSync(new URL('../dashboard/src/components/ReferenceLibrary.jsx', import.meta.url), 'utf8');
const drivePicker = fs.readFileSync(new URL('../dashboard/src/components/GoogleDrivePicker.jsx', import.meta.url), 'utf8');
const chatApi = fs.readFileSync(new URL('../src/api/chat.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../dashboard/src/App.jsx', import.meta.url), 'utf8');

test('support answers are tenant-owned and can sync to GHL knowledge', () => {
  assert.match(adminApi, /SUPPORT_ANSWERS_KEY = 'support_answers'/);
  assert.match(adminApi, /getUserOrgId\(req\)/);
  assert.match(adminApi, /router\.post\('\/support-answers\/:id\/sync-ghl'/);
  assert.match(adminApi, /ghl_create_knowledge_base_faq/);
});

test('support answer editing opens a visible modal and uses authenticated APIs', () => {
  assert.match(adminUi, /aria-label="Edit support answer"/);
  assert.match(adminUi, /Save Changes/);
  assert.match(adminUi, /\/api\/bloomie-admin\/support-answers/);
  assert.doesNotMatch(adminUi, /window\.scrollTo\(\{ top: 0/);
});

test('Bloomie chat and support inbox can reuse approved support answers', () => {
  assert.match(chatApi, /APPROVED TENANT SUPPORT ANSWERS/);
  assert.match(chatApi, /\.eq\('key', 'support_answers'\)/);
  assert.match(adminUi, /Insert a support answer/);
});

test('Google Drive browsing and downloads stay inside the authenticated tenant', () => {
  assert.match(filesApi, /router\.get\('\/google-drive\/list'/);
  assert.match(filesApi, /router\.get\('\/google-drive\/:fileId\/download'/);
  assert.match(filesApi, /getUserOrgId\(req\)/);
  assert.match(filesApi, /getGoogleDriveAccessToken\(sb\(\), orgId\)/);
  assert.match(filesApi, /Google Drive files must be 20 MB or smaller/);
});

test('Drive is a reusable source in References, Chat, Work, and Brand Kit', () => {
  assert.match(referenceUi, /Choose from Google Drive/);
  assert.match(referenceUi, /GoogleDrivePicker/);
  assert.match(drivePicker, /Search Drive files/);
  assert.match(app, /Choose from Google Drive/);
  assert.match(app, /workDriveOpen/);
  assert.match(app, /drivePickerOpen/);
  assert.match(app, /brandDriveOpen/);
});
