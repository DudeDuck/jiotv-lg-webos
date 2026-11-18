/* Which hosts the TV service may talk to, and which headers each may receive.
   Kept free of webOS dependencies so it can be unit tested. */
var URL = require("url").URL;

var EXTERNAL_HEADERS = ["user-agent", "cookie", "range", "accept", "accept-encoding"];

function isJioHost(hostname) {
  var host = String(hostname || "").toLowerCase();
  return host === "jio.com" || host.slice(-8) === ".jio.com" || host.slice(-11) === ".jiocdn.com";
}

function createHostPolicy() {
  var streamHosts = {};
  var licenseHosts = {};

  function trust(store, rawUrl) {
    try {
      var u = new URL(rawUrl);
      if (u.protocol === "https:" && !isJioHost(u.hostname)) store[u.hostname.toLowerCase()] = true;
    } catch (_) {}
  }

  return {
    /* Hosts named in Jio's own playback response: stream and manifest hosts get only the
       signed token (see headersForHost), never the account headers. */
    trustStreamUrl: function(rawUrl) { trust(streamHosts, rawUrl); },
    /* Licence servers need the account headers, as in Jio's own app. */
    trustLicenseUrl: function(rawUrl) { trust(licenseHosts, rawUrl); },
    isAllowedHost: function(hostname) {
      return isJioHost(hostname) || streamHosts[String(hostname || "").toLowerCase()] === true;
    },
    isLicenseHostAllowed: function(hostname) {
      return isJioHost(hostname) || licenseHosts[String(hostname || "").toLowerCase()] === true;
    },
    headersForHost: function(hostname, headers) {
      if (isJioHost(hostname)) return headers;
      var out = {};
      Object.keys(headers || {}).forEach(function(name) {
        if (EXTERNAL_HEADERS.indexOf(name.toLowerCase()) >= 0) out[name] = headers[name];
      });
      return out;
    },
    reset: function() { streamHosts = {}; licenseHosts = {}; }
  };
}

module.exports = { isJioHost: isJioHost, createHostPolicy: createHostPolicy };
