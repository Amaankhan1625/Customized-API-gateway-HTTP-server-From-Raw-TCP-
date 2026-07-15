const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEFAULT_PUBLIC_KEY_PATH = process.env.JWT_PUBLIC_KEY_PATH || path.join(__dirname, '..', 'public.pem');

const API_KEYS = new Map([
  ['key_prod_abc123', { userId: 'service-prod', role: 'service' }],
  ['key_dev_xyz789', { userId: 'service-dev', role: 'service' }],
]);

function getPublicKey() {
  if (!fs.existsSync(DEFAULT_PUBLIC_KEY_PATH)) {
    return null;
  }

  return fs.readFileSync(DEFAULT_PUBLIC_KEY_PATH, 'utf8');
}

function base64UrlToBuffer(value) {
  const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Buffer.from(padded, 'base64');
}

function timingSafeEquals(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyApiKey(req, route) {
  const key = req.headers['x-api-key'];

  if (!key) {
    const error = new Error('Missing X-API-Key header');
    error.statusCode = 401;
    throw error;
  }

  const allowedKeys = Array.isArray(route.apikeys) && route.apikeys.length > 0 ? route.apikeys : [...API_KEYS.keys()];

  for (const allowedKey of allowedKeys) {
    if (timingSafeEquals(key, allowedKey)) {
      const metadata = API_KEYS.get(allowedKey) || { userId: `api-key:${allowedKey}`, role: 'service' };
      return {
        userId: metadata.userId,
        role: metadata.role,
        authType: 'apikey',
      };
    }
  }

  const error = new Error('Invalid API key');
  error.statusCode = 401;
  throw error;
}

function verifyJwtToken(token) {
  const publicKey = getPublicKey();

  if (!publicKey) {
    const error = new Error('Missing JWT public key');
    error.statusCode = 500;
    throw error;
  }

  const parts = String(token).split('.');
  if (parts.length !== 3) {
    const error = new Error('Invalid token');
    error.statusCode = 401;
    throw error;
  }

  const signingInput = `${parts[0]}.${parts[1]}`;
  const signatureBuffer = base64UrlToBuffer(parts[2]);
  const verifier = crypto.createVerify('RSA-SHA256');

  verifier.update(signingInput);
  verifier.end();

  if (!verifier.verify(publicKey, signatureBuffer)) {
    const error = new Error('Invalid token');
    error.statusCode = 401;
    throw error;
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlToBuffer(parts[1]).toString('utf8'));
  } catch {
    const error = new Error('Invalid token');
    error.statusCode = 401;
    throw error;
  }

  if (typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()) {
    const error = new Error('Token expired');
    error.statusCode = 401;
    error.details = { expiredAt: new Date(payload.exp * 1000).toISOString() };
    throw error;
  }

  return {
    userId: payload.sub || payload.userId || 'unknown',
    role: payload.role || 'user',
    claims: payload,
    authType: 'jwt',
  };
}

function verifyRouteAuth(req, route) {
  const authType = String(route.auth || 'public').toLowerCase();

  if (authType === 'public' || authType === 'none') {
    return { authType: 'public' };
  }

  if (authType === 'apikey') {
    return verifyApiKey(req, route);
  }

  if (authType === 'jwt') {
    const authorization = req.headers.authorization || '';

    if (!authorization.startsWith('Bearer ')) {
      const error = new Error('Missing or malformed Authorization header');
      error.statusCode = 401;
      throw error;
    }

    const identity = verifyJwtToken(authorization.slice(7).trim());
    const allowedRoles = Array.isArray(route.roles) ? route.roles : [];

    if (allowedRoles.length > 0 && !allowedRoles.includes(identity.role)) {
      const error = new Error('Insufficient role');
      error.statusCode = 403;
      throw error;
    }

    return identity;
  }

  const error = new Error(`Unknown auth type: ${route.auth}`);
  error.statusCode = 500;
  throw error;
}

function createUnauthorizedResponse(res, message, details = {}) {
  res.statusCode = 401;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ error: 'Unauthorized', message, ...details }));
}

function createForbiddenResponse(res, message, details = {}) {
  res.statusCode = 403;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ error: 'Forbidden', message, ...details }));
}

module.exports = {
  verifyRouteAuth,
  createUnauthorizedResponse,
  createForbiddenResponse,
};