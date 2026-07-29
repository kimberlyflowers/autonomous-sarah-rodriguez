import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const appSource = fs.readFileSync(new URL('../dashboard/src/App.jsx', import.meta.url), 'utf8');
const desktopApiSource = fs.readFileSync(new URL('../src/api/desktop.js', import.meta.url), 'utf8');

test('account menu exposes the authenticated desktop download page', () => {
  assert.match(appSource, /l:"Download Desktop App",fn:\(\)=>\{setPg\("dispatch"\)/);
});

test('Mac and Windows buttons request their own platform builds', () => {
  assert.match(appSource, /onClick=\{\(\) => downloadDesktop\('mac-arm64'\)\}/);
  assert.match(appSource, /onClick=\{\(\) => downloadDesktop\('windows'\)\}/);
  assert.doesNotMatch(appSource, /downloadDesktop\(isMac \? 'mac-arm64' : 'windows'\)/);
});

test('download UI reflects Railway build availability', () => {
  assert.match(appSource, /desktopAvail\?\.\['mac-arm64'\]\?\.available === false/);
  assert.match(appSource, /desktopAvail\?\.windows\?\.available === false/);
  assert.match(appSource, /BLOOM-Desktop-Windows\.exe/);
});

test('Railway serves installers through tenant-authenticated one-time tokens', () => {
  assert.match(desktopApiSource, /router\.post\('\/download-token\/:platform'/);
  assert.match(desktopApiSource, /organization_members/);
  assert.match(desktopApiSource, /downloadTokens\.set\(token/);
  assert.match(desktopApiSource, /router\.get\('\/download\/:platform'/);
});
