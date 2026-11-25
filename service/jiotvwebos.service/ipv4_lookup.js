/* DNS lookup for the service's requests that only returns IPv4 addresses.
   Newer Node.js (autoSelectFamily, the default from Node 20) calls the lookup with
   { all: true } and expects a list of addresses back; older Node expects one address.
   Passing the caller's options through, with family forced to 4, answers both. */
var dns = require("dns");

function lookupIpv4(hostname, options, callback) {
  if (typeof options === "function") { callback = options; options = {}; }
  if (!options || typeof options !== "object") options = {};
  dns.lookup(hostname, Object.assign({}, options, { family: 4 }), callback);
}

module.exports = { lookupIpv4: lookupIpv4 };
