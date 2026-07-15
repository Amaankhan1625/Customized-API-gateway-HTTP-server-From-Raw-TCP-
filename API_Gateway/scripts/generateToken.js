const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const privateKeyPath = process.argv[2] || path.join(__dirname, '..', 'private.pem');

if (!fs.existsSync(privateKeyPath)) {
  console.error(`Missing private key: ${privateKeyPath}`);
  process.exit(1);
}

const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
const now = Math.floor(Date.now() / 1000);
const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
const payload = Buffer.from(JSON.stringify({ sub: 'user_123', role: 'admin', iat: now, exp: now + 3600 })).toString('base64url');
const signingInput = `${header}.${payload}`;
const signer = crypto.createSign('RSA-SHA256');

signer.update(signingInput);
signer.end();

const signature = signer.sign(privateKey).toString('base64url');
console.log(`${signingInput}.${signature}`);