const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { lookupIpv4 } = require('../service/jiotvwebos.service/ipv4_lookup');

function lookup(options) {
  return new Promise((resolve, reject) => {
    const done = (error, address, family) => (error ? reject(error) : resolve({ address, family }));
    if (options === undefined) lookupIpv4('localhost', done); else lookupIpv4('localhost', options, done);
  });
}

test('single-address form (older Node) returns one IPv4 address', async () => {
  for (const options of [undefined, {}, { family: 6 }, 0]) {
    const { address, family } = await lookup(options);
    assert.strictEqual(typeof address, 'string', `options ${JSON.stringify(options)}`);
    assert.strictEqual(family, 4);
  }
});

test('list form (newer Node, all: true) returns IPv4 addresses only', async () => {
  const { address } = await lookup({ all: true });
  assert.ok(Array.isArray(address) && address.length > 0);
  for (const entry of address) assert.strictEqual(entry.family, 4);
});

// The TV error "Invalid IP address: undefined" came from requests made with
// autoSelectFamily on; make real requests both ways.
test('HTTP requests work with autoSelectFamily on and off', async () => {
  const server = http.createServer((req, res) => res.end('ok')).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    for (const autoSelectFamily of [true, false]) {
      const status = await new Promise((resolve, reject) => {
        http.get({ hostname: 'localhost', port: server.address().port, lookup: lookupIpv4, autoSelectFamily }, (res) => {
          res.resume(); resolve(res.statusCode);
        }).on('error', reject);
      });
      assert.strictEqual(status, 200, `autoSelectFamily=${autoSelectFamily}`);
    }
  } finally { server.close(); }
});
