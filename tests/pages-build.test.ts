import assert from 'node:assert/strict';
import test from 'node:test';
import { pagesApiURL } from '../tools/build-pages.mjs';

test('Pages build derives the API URL from the common server address and port', () => {
  assert.equal(pagesApiURL('se.mipselqq.uk', '50026'), 'https://se.mipselqq.uk:50027/api');
  assert.equal(pagesApiURL(' localhost ', '8081', '443'), 'https://localhost:443/api');
  assert.equal(pagesApiURL('127.0.0.1', '80', '8443'), 'https://127.0.0.1:8443/api');
  assert.equal(pagesApiURL('[2001:db8::1]', '8081'), 'https://[2001:db8::1]:50027/api');
  assert.equal(pagesApiURL('2001:db8::1', '8081'), 'https://[2001:db8::1]:50027/api');
});

test('Pages build refuses missing or unsuitable public server URLs', () => {
  for (const value of [
    undefined,
    '',
    ' ',
    '/api',
    'https://example.com',
    'example.com:8081',
    'user@example.com',
    '-oProxyCommand=whoami',
    'example.com\nUser root',
    'example.com/path',
    'example.com?token=secret',
    'example.com#fragment',
    '999.999.999.999',
    'fe80::1%eth0',
  ]) {
    assert.throws(() => pagesApiURL(value, '8081'), String(value));
  }
  for (const port of [undefined, '', '0', '-1', '65536', '1.5', '1e3', '00080', '80;id']) {
    assert.throws(() => pagesApiURL('example.com', port), String(port));
  }
  for (const port of ['', '0', '-1', '65536', '1.5', '1e3', '00080', '80;id']) {
    assert.throws(() => pagesApiURL('example.com', '50026', port), String(port));
  }
});
