const test = require('node:test');
const assert = require('node:assert');
const { isJioHost, createHostPolicy } = require('../service/jiotvwebos.service/host_policy');

const ACCOUNT = { ssoToken: 's', Accesstoken: 'a', userId: 'u', crmid: 'c', 'User-Agent': 'ua', Cookie: '__hdnea__=x', Range: 'bytes=0-1' };

test('isJioHost: accepts Jio domains, rejects look-alikes', () => {
  for (const h of ['jio.com', 'a.jio.com', 'x.jiocdn.com', 'A.JIO.COM']) assert.strictEqual(isJioHost(h), true, h);
  for (const h of ['evil.com', 'notjio.com', 'jio.com.evil.com', 'jiocdn.com', '', null]) assert.strictEqual(isJioHost(h), false, String(h));
});

test('unlisted hosts are refused until Jio names them', () => {
  const p = createHostPolicy();
  assert.strictEqual(p.isAllowedHost('cdn.example.net'), false);
  p.trustStreamUrl('https://cdn.example.net/live/a.mpd?__hdnea__=x');
  assert.strictEqual(p.isAllowedHost('cdn.example.net'), true);
  assert.strictEqual(p.isAllowedHost('CDN.Example.NET'), true);
  assert.strictEqual(p.isAllowedHost('other.example.net'), false);
});

test('only https URLs and valid URLs are trusted', () => {
  const p = createHostPolicy();
  p.trustStreamUrl('http://plain.example.net/a.m3u8');
  p.trustStreamUrl('not a url');
  p.trustStreamUrl('');
  assert.strictEqual(p.isAllowedHost('plain.example.net'), false);
});

test('trusting a stream host does not allow it as a licence server, and vice versa', () => {
  const p = createHostPolicy();
  p.trustStreamUrl('https://stream.example.net/a.mpd');
  p.trustLicenseUrl('https://license.example.net/wv');
  assert.strictEqual(p.isLicenseHostAllowed('stream.example.net'), false);
  assert.strictEqual(p.isAllowedHost('license.example.net'), false);
  assert.strictEqual(p.isLicenseHostAllowed('license.example.net'), true);
  assert.strictEqual(p.isLicenseHostAllowed('x.jio.com'), true);
});

test('non-Jio hosts receive only the signed token, never account headers', () => {
  const p = createHostPolicy();
  assert.deepStrictEqual(p.headersForHost('cdn.example.net', ACCOUNT), { 'User-Agent': 'ua', Cookie: '__hdnea__=x', Range: 'bytes=0-1' });
  assert.strictEqual(p.headersForHost('a.jio.com', ACCOUNT), ACCOUNT);
});

test('reset forgets trusted hosts', () => {
  const p = createHostPolicy();
  p.trustStreamUrl('https://cdn.example.net/a');
  p.trustLicenseUrl('https://lic.example.net/a');
  p.reset();
  assert.strictEqual(p.isAllowedHost('cdn.example.net'), false);
  assert.strictEqual(p.isLicenseHostAllowed('lic.example.net'), false);
});
