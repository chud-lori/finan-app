// Matched on the path rather than on the route, so the redaction survives the endpoint moving.
const TOKEN_PATH = /(\/verify-email\/)[^/?#]+/g;

const redactUrl = (url) => String(url || '').replace(TOKEN_PATH, '$1[redacted]');

module.exports = { redactUrl };
