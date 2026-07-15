const http = require('http');
const https = require('https');
const { URL } = require('url');
const crypto = require('crypto');

function getHttpClient(targetUrl) {
  return targetUrl.protocol === 'https:' ? https : http;
}

function buildForwardHeaders(req, route, identity) {
  const headers = { ...req.headers };

  delete headers.connection;
  delete headers['proxy-connection'];
  delete headers.te;
  delete headers.trailer;
  delete headers['transfer-encoding'];
  delete headers.upgrade;
  delete headers.authorization;
  delete headers['x-api-key'];

  headers.host = new URL(route.target).host;
  headers['x-request-id'] = req.headers['x-request-id'] || generateRequestId();
  headers['x-gateway-time'] = Date.now().toString();
  headers['x-forwarded-for'] = req.headers['x-forwarded-for']
    ? `${req.headers['x-forwarded-for']}, ${req.socket.remoteAddress || ''}`.trim().replace(/^,\s*/, '')
    : req.socket.remoteAddress || '';
  headers['x-forwarded-proto'] = req.socket.encrypted ? 'https' : 'http';

  if (identity?.userId) {
    headers['x-user-id'] = identity.userId;
  }

  if (identity?.role) {
    headers['x-user-role'] = identity.role;
  }

  return headers;
}

function generateRequestId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return crypto.randomBytes(16).toString('hex');
}

function createUpstreamUrl(route, req) {
  const targetUrl = new URL(route.target);
  const inboundUrl = new URL(req.url, 'http://localhost');

  targetUrl.pathname = inboundUrl.pathname;
  targetUrl.search = inboundUrl.search;

  return targetUrl;
}

function proxyRequest(req, res, route, identity = {}) {
  const targetUrl = createUpstreamUrl(route, req);
  const client = getHttpClient(targetUrl);
  const forwardHeaders = buildForwardHeaders(req, route, identity);

  const upstreamRequest = client.request({
    protocol: targetUrl.protocol,
    hostname: targetUrl.hostname,
    port: targetUrl.port || undefined,
    method: req.method,
    path: `${targetUrl.pathname}${targetUrl.search}`,
    headers: forwardHeaders,
  }, (upstreamResponse) => {
    res.writeHead(upstreamResponse.statusCode || 502, upstreamResponse.headers);
    upstreamResponse.pipe(res);
  });

  upstreamRequest.on('error', (error) => {
    if (!res.headersSent) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Bad Gateway', message: error.message }));
      return;
    }

    res.destroy(error);
  });

  req.pipe(upstreamRequest);
}

module.exports = { proxyRequest };
