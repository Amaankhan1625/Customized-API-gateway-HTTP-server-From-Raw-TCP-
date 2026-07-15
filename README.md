# HTTP Server from Raw TCP + API Gateway
### Complete Project Documentation

**Stack:** Node.js · Express · Redis · Prometheus · Docker  
**Duration:** 7 weeks  
**Difficulty:** Intermediate–Advanced (fresher-friendly with this guide)

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [What You Will Build](#2-what-you-will-build)
3. [Prerequisites](#3-prerequisites)
4. [Concepts You Must Know](#4-concepts-you-must-know)
5. [Project 1 — HTTP Server from Raw TCP](#5-project-1--http-server-from-raw-tcp)
   - [Week 1 — TCP foundation and request parsing](#week-1--tcp-foundation-and-request-parsing)
   - [Week 2 — Response writer, routing, body parsing](#week-2--response-writer-routing-and-body-parsing)
   - [Week 3 — Keep-alive, middleware, benchmarking](#week-3--keep-alive-middleware-and-benchmarking)
6. [Project 2 — Custom API Gateway](#6-project-2--custom-api-gateway)
   - [Week 4 — Reverse proxy core](#week-4--reverse-proxy-core)
   - [Week 5 — Auth middleware (JWT + API keys)](#week-5--auth-middleware)
   - [Week 6 — Rate limiting and caching](#week-6--rate-limiting-and-caching)
   - [Week 7 — Metrics, load test, deploy](#week-7--metrics-load-test-and-deploy)
7. [File Structure](#7-file-structure)
8. [npm Packages Reference](#8-npm-packages-reference)
9. [Testing Checklist](#9-testing-checklist)
10. [Resume and Interview Guide](#10-resume-and-interview-guide)

---

## 1. Project Overview

### Why these two projects together

Most freshers build microservices with Express and call it "backend experience." These two projects go deeper — you build what Express is built on, then you build what AWS API Gateway does commercially.

```
Project 1: HTTP/1.1 server from raw TCP
  → You parse bytes manually. No http module. No Express.
  → Teaches: TCP, HTTP protocol, Node event loop, Buffers, parsing

Project 2: API Gateway on top of Express
  → Reverse proxy + auth + rate limiting + caching + metrics
  → Teaches: security, distributed systems, observability
```

Together they answer the most common senior-dev interview questions:
- "How does HTTP actually work at the byte level?"
- "How would you build a system that handles auth, traffic, and reliability at scale?"

---

## 2. What You Will Build

### Project 1 — HTTP Server (Weeks 1–3)

A production-capable HTTP/1.1 server using only `node:net` from the Node.js standard library.

**Features by end of Week 3:**
- Accepts TCP connections on any port
- Parses raw HTTP/1.1 requests from Buffers (request line, headers, body)
- Handles chunked data arrival across multiple `data` events
- Writes correctly formatted HTTP responses with Content-Length
- Routes requests by method + path with path parameter support (`/users/:id`)
- Parses JSON and URL-encoded request bodies
- Implements HTTP keep-alive (persistent connections)
- Middleware chain pattern (same as Express internals)
- Connection limits and idle timeouts
- Load tested at 5,000+ req/sec with autocannon

### Project 2 — API Gateway (Weeks 4–7)

A production-grade API gateway built on Express that sits in front of any number of backend services.

**Features by end of Week 7:**
- Reverse proxy: routes requests to upstream services based on YAML config
- Hot-reload config without restarting the server
- Upstream health checks every 10 seconds; returns 502 when a service is down
- Auth middleware: API key validation (timing-safe) + JWT verification (RS256)
- Per-route auth config: some routes need JWT, some need API key, some are public
- Redis-backed rate limiting: token bucket (in-memory) + sliding window (distributed)
- Response cache: stores GET responses in Redis with configurable TTL
- `X-Cache: HIT/MISS` header, `X-RateLimit-*` headers, `Retry-After` on 429
- Prometheus metrics: request count, latency histogram, cache hit rate
- Grafana dashboard for real-time visualisation
- Docker Compose: spin up gateway + Redis + Prometheus + Grafana with one command
- Deployed to Railway/Render with a live URL

---

## 3. Prerequisites

### Tools to install before Day 1

```bash
# Node.js 20 or higher
node --version   # must be v20+

# npm (comes with Node)
npm --version

# Redis (for Project 2)
# macOS
brew install redis && brew services start redis

# Ubuntu/WSL
sudo apt install redis-server && sudo service redis start

# Docker (for Week 7)
# Download from https://docs.docker.com/get-docker/

# autocannon (load testing)
npm install -g autocannon

# curl (usually pre-installed)
curl --version
```

### Verify everything works

```bash
node -e "const net = require('net'); console.log('net OK')"
redis-cli ping   # should return PONG
autocannon --version
```

---

## 4. Concepts You Must Know

Learn these in order before writing code. Each concept unlocks the next.

### Level 1 — JavaScript async (learn on Day 0)

| Concept | Why you need it |
|---------|-----------------|
| Promises | All Node I/O returns Promises |
| async/await | Cleaner syntax for Promise chains |
| EventEmitter | socket.on('data') is an EventEmitter |
| try/catch in async | Prevents server crashes from unhandled errors |

**Quick test:** Can you explain what happens when you `await` a rejected Promise without a try/catch? (Answer: unhandled rejection, crashes in Node 15+)

### Level 2 — Networking (learn Week 1)

| Concept | Why you need it |
|---------|-----------------|
| TCP vs UDP | HTTP uses TCP — reliable, ordered, connected |
| TCP 3-way handshake | SYN → SYN-ACK → ACK happens before any HTTP byte |
| What is a socket | A file descriptor for one end of a TCP connection |
| Ports | IP + port = unique service address |
| net.createServer() | Opens a server socket, calls your handler per connection |

### Level 3 — HTTP protocol (learn Week 1)

The exact format of an HTTP request (you will parse this by hand):

```
GET /users?page=2 HTTP/1.1\r\n
Host: localhost:8080\r\n
Content-Type: application/json\r\n
\r\n
{"name":"alice"}
```

Key rules:
- Lines separated by `\r\n` (CRLF), NOT just `\n`
- Headers end at the first blank line (`\r\n\r\n`)
- Body length determined by `Content-Length` header
- `Connection: keep-alive` means reuse the socket for multiple requests

### Level 4 — Node.js internals (learn Week 1)

**The event loop — the most important Node concept:**

```
Node.js is single-threaded. It handles thousands of connections because:
1. socket.on('data', cb) registers a callback — does NOT block
2. Node's libuv layer watches the OS for I/O events
3. When bytes arrive, libuv puts your callback in the event queue
4. The single thread processes the queue one callback at a time
5. While waiting for I/O, it processes other callbacks

This is why you never write blocking code (fs.readFileSync) in request handlers.
```

**Buffers:**
```javascript
// socket.on('data') gives you a Buffer, not a string
socket.on('data', (chunk) => {
  // chunk is a Buffer — raw bytes
  const str = chunk.toString('utf8');  // convert to string

  // CRITICAL: never use str.length for Content-Length
  // An emoji is 1 char but 4 bytes
  const byteLength = Buffer.byteLength(str, 'utf8');  // correct
});
```

### Level 5 — Security concepts (learn Week 5)

| Concept | Why you need it |
|---------|-----------------|
| JWT structure (header.payload.signature) | You verify every request token |
| HS256 vs RS256 | RS256 is safer — gateway only needs public key |
| Timing attacks | Why `===` is wrong for API key comparison |
| crypto.timingSafeEqual | Constant-time comparison — prevents key guessing |
| 401 vs 403 | 401 = not authenticated, 403 = authenticated but forbidden |

### Level 6 — Redis (learn Week 6)

```bash
# Commands you'll actually use:
SET key value EX 60    # set with 60-second TTL
GET key                # retrieve
INCR counter           # atomic increment (for rate limiting)
EXPIRE key 60          # set TTL on existing key
DEL key                # delete
```

---

## 5. Project 1 — HTTP Server from Raw TCP

### Week 1 — TCP foundation and request parsing

**Goal:** A TCP server that accepts connections, reads raw bytes, and parses HTTP requests into structured objects.

**No npm packages this week.** Only `node:net` from stdlib.

#### Day 1 — TCP server and first connection

```javascript
// src/server.js
const net = require('net');

let connectionCount = 0;

const server = net.createServer((socket) => {
  connectionCount++;
  console.log(`[+] Client connected: ${socket.remoteAddress}:${socket.remotePort} (total: ${connectionCount})`);

  socket.on('error', (err) => {
    console.error(`Socket error:`, err.message);
  });

  socket.on('close', () => {
    connectionCount--;
    console.log(`[-] Client disconnected (total: ${connectionCount})`);
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('Port 8080 is already in use');
    process.exit(1);
  }
  console.error('Server error:', err);
});

server.listen(8080, () => {
  console.log('Server listening on port 8080');
});
```

**Test:** `curl http://localhost:8080` — you should see "Client connected" in your terminal. curl will hang (no response yet) — that is correct.

#### Day 2 — Read raw bytes and see HTTP

```javascript
// Inside the createServer callback, after the socket handlers:

let rawRequest = '';

socket.on('data', (chunk) => {
  rawRequest += chunk.toString('utf8');

  // Headers end at the first blank line
  if (rawRequest.includes('\r\n\r\n')) {
    console.log('=== RAW HTTP REQUEST ===');
    console.log(rawRequest);
    console.log('========================');
  }
});
```

**Test:** Run `curl -v http://localhost:8080` and `curl -X POST http://localhost:8080 -d '{"hello":"world"}' -H "Content-Type: application/json"`. Compare the raw output for each.

**What you will see:**
```
GET / HTTP/1.1
Host: localhost:8080
User-Agent: curl/8.x.x
Accept: */*

```

#### Day 3 — Parse request line and headers

```javascript
// src/parser.js

function parseRequest(raw) {
  // Split headers from body at the blank line
  const separatorIndex = raw.indexOf('\r\n\r\n');
  if (separatorIndex === -1) return null;  // incomplete request

  const headerSection = raw.slice(0, separatorIndex);
  const body = raw.slice(separatorIndex + 4);

  const lines = headerSection.split('\r\n');

  // Line 0: "GET /path?query HTTP/1.1"
  const [method, rawPath, httpVersion] = lines[0].split(' ');

  // Split path from query string
  const qmarkIndex = rawPath.indexOf('?');
  const pathname = qmarkIndex === -1 ? rawPath : rawPath.slice(0, qmarkIndex);
  const queryString = qmarkIndex === -1 ? '' : rawPath.slice(qmarkIndex + 1);

  // Parse headers: "Header-Name: value"
  // IMPORTANT: split on ': ' but only on the FIRST colon
  // (header values can contain colons, e.g. Authorization: Bearer a:b:c)
  const headers = {};
  for (let i = 1; i < lines.length; i++) {
    const colonIdx = lines[i].indexOf(': ');
    if (colonIdx === -1) continue;
    const key = lines[i].slice(0, colonIdx).toLowerCase();
    const value = lines[i].slice(colonIdx + 2);
    headers[key] = value;
  }

  // Parse query string into object
  const query = {};
  if (queryString) {
    queryString.split('&').forEach(pair => {
      const [k, v] = pair.split('=');
      if (k) query[decodeURIComponent(k)] = decodeURIComponent(v || '');
    });
  }

  return { method, pathname, query, headers, httpVersion, body };
}

module.exports = { parseRequest };
```

**Test your parser with hardcoded input:**

```javascript
// Quick test — run with: node src/parser.js
const { parseRequest } = require('./parser');

const raw = 'GET /users?page=2 HTTP/1.1\r\nHost: localhost:8080\r\nAuthorization: Bearer abc:def\r\n\r\n';
const parsed = parseRequest(raw);

console.assert(parsed.method === 'GET', 'method');
console.assert(parsed.pathname === '/users', 'pathname');
console.assert(parsed.query.page === '2', 'query');
console.assert(parsed.headers['authorization'] === 'Bearer abc:def', 'auth header');
console.log('All assertions passed');
```

#### Day 4 — Write a valid HTTP response

```javascript
// src/response.js

const STATUS_PHRASES = {
  200: 'OK',
  201: 'Created',
  204: 'No Content',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
};

function sendResponse(socket, statusCode, headers = {}, body = '') {
  const bodyBuffer = Buffer.from(body, 'utf8');

  const allHeaders = {
    'Content-Type': 'text/plain; charset=utf-8',
    ...headers,
    'Content-Length': bodyBuffer.byteLength,  // always last — calculated
    'Date': new Date().toUTCString(),
  };

  const headerLines = Object.entries(allHeaders)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\r\n');

  const statusPhrase = STATUS_PHRASES[statusCode] || 'Unknown';
  const statusLine = `HTTP/1.1 ${statusCode} ${statusPhrase}`;

  socket.write(`${statusLine}\r\n${headerLines}\r\n\r\n`);
  socket.end(bodyBuffer);
}

function sendJSON(socket, statusCode, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  sendResponse(socket, statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...extraHeaders,
  }, body);
}

module.exports = { sendResponse, sendJSON };
```

**Test:** `curl -v http://localhost:8080` — check that the response has a correct status line, Content-Length header, and body. The `-v` flag shows all headers.

#### Day 5 — Multiple connections and milestone test

Wire everything together in `server.js`:

```javascript
// src/server.js (complete Day 5 version)
const net = require('net');
const { parseRequest } = require('./parser');
const { sendResponse, sendJSON } = require('./response');

let connectionCount = 0;

const server = net.createServer((socket) => {
  connectionCount++;
  let rawRequest = '';  // LOCAL to each connection — never shared

  socket.on('data', (chunk) => {
    rawRequest += chunk.toString('utf8');

    if (!rawRequest.includes('\r\n\r\n')) return;  // wait for full headers

    const req = parseRequest(rawRequest);
    if (!req) return;

    console.log(`${req.method} ${req.pathname}`);

    if (req.pathname === '/') {
      sendJSON(socket, 200, { message: 'Hello from raw TCP!', connections: connectionCount });
    } else {
      sendJSON(socket, 404, { error: 'Not Found', path: req.pathname });
    }

    rawRequest = '';  // reset for next request on this socket
  });

  socket.on('error', (err) => console.error('Socket error:', err.message));
  socket.on('close', () => connectionCount--);
});

server.on('error', (err) => console.error('Server error:', err));
server.listen(8080, () => console.log('Listening on http://localhost:8080'));
```

**Week 1 milestone tests — all must pass:**

```bash
# Test 1: basic GET
curl -v http://localhost:8080/
# Expected: 200 OK, JSON body, correct Content-Length

# Test 2: unknown path
curl -v http://localhost:8080/unknown
# Expected: 404 Not Found, JSON error body

# Test 3: POST request
curl -v -X POST http://localhost:8080/ -d '{"test":true}' -H "Content-Type: application/json"
# Expected: 200 OK (server receives and logs the body)

# Test 4: browser
# Open http://localhost:8080 — should render the JSON response

# Test 5: simultaneous connections
curl http://localhost:8080/ &
curl http://localhost:8080/ &
# Both should return valid responses, no data mixing

# Test 6: favicon (browser sends this automatically)
curl -v http://localhost:8080/favicon.ico
# Expected: 404 Not Found (not a crash)
```

**Git commit:** `git commit -m "Week 1: TCP server parses HTTP requests and sends responses"`

---

### Week 2 — Response writer, routing, and body parsing

**Goal:** A proper router with path parameters, JSON body parsing, and correct handling of all HTTP methods.

#### Router (`src/router.js`)

```javascript
// src/router.js

class Router {
  constructor() {
    this.routes = [];  // [{ method, pattern, paramNames, handler }]
  }

  // Register a route: router.get('/users/:id', handler)
  register(method, path, handler) {
    const paramNames = [];
    // Convert /users/:id to a regex: /^\/users\/([^/]+)$/
    const regexStr = path.replace(/:([^/]+)/g, (_, name) => {
      paramNames.push(name);
      return '([^/]+)';
    });
    const pattern = new RegExp(`^${regexStr}$`);
    this.routes.push({ method: method.toUpperCase(), pattern, paramNames, handler });
  }

  get(path, handler)    { this.register('GET', path, handler); }
  post(path, handler)   { this.register('POST', path, handler); }
  put(path, handler)    { this.register('PUT', path, handler); }
  delete(path, handler) { this.register('DELETE', path, handler); }

  match(method, pathname) {
    // First find all routes that match the path
    const pathMatches = this.routes.filter(r => r.pattern.test(pathname));

    if (pathMatches.length === 0) {
      return { matched: false, reason: 'not_found' };
    }

    // Then filter by method
    const methodMatch = pathMatches.find(r => r.method === method.toUpperCase());
    if (!methodMatch) {
      const allowed = pathMatches.map(r => r.method).join(', ');
      return { matched: false, reason: 'wrong_method', allowed };
    }

    // Extract path params
    const match = pathname.match(methodMatch.pattern);
    const params = {};
    methodMatch.paramNames.forEach((name, i) => {
      params[name] = decodeURIComponent(match[i + 1]);
    });

    return { matched: true, handler: methodMatch.handler, params };
  }
}

module.exports = { Router };
```

#### Body parser (`src/bodyParser.js`)

```javascript
// src/bodyParser.js

function parseBody(raw, headers) {
  const separatorIndex = raw.indexOf('\r\n\r\n');
  if (separatorIndex === -1) return null;

  const bodyStr = raw.slice(separatorIndex + 4);
  const contentType = headers['content-type'] || '';
  const contentLength = parseInt(headers['content-length'] || '0', 10);

  // Only read exactly Content-Length bytes — not until connection close
  const bodyTrimmed = bodyStr.slice(0, contentLength);

  if (!bodyTrimmed) return null;

  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(bodyTrimmed);
    } catch {
      return null;
    }
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const result = {};
    bodyTrimmed.split('&').forEach(pair => {
      const [k, v] = pair.split('=');
      if (k) result[decodeURIComponent(k)] = decodeURIComponent(v || '');
    });
    return result;
  }

  return bodyTrimmed;  // raw string for other content types
}

module.exports = { parseBody };
```

#### Week 2 milestone

```bash
# Path parameters
curl http://localhost:8080/users/42
# Expected: { "userId": "42" }

# POST with JSON body
curl -X POST http://localhost:8080/users \
  -H "Content-Type: application/json" \
  -d '{"name":"alice","email":"alice@example.com"}'
# Expected: 201 Created, echoed body

# Wrong method on known route
curl -X DELETE http://localhost:8080/
# Expected: 405 Method Not Allowed, Allow: GET header

# Query string parsing
curl "http://localhost:8080/users?page=2&limit=10"
# Expected: { "page": "2", "limit": "10" }
```

---

### Week 3 — Keep-alive, middleware, and benchmarking

**Goal:** Persistent connections, a middleware chain, connection limits, and a load test with a number to put on your resume.

#### Keep-alive

```javascript
// In the data handler, instead of socket.end() after response:
// Check if client wants to keep the connection alive

function shouldKeepAlive(req) {
  const connection = req.headers['connection'] || '';
  if (req.httpVersion === 'HTTP/1.1') {
    return connection.toLowerCase() !== 'close';  // default keep-alive in 1.1
  }
  return connection.toLowerCase() === 'keep-alive';  // must be explicit in 1.0
}

// In sendResponse, add the Connection header:
'Connection': keepAlive ? 'keep-alive' : 'close'

// Don't call socket.end() when keepAlive is true — just reset rawRequest = ''
```

#### Middleware chain

```javascript
// src/middleware.js

function createMiddlewareChain(middlewares, finalHandler) {
  return async (req, res) => {
    let index = 0;

    async function next() {
      if (index >= middlewares.length) {
        return finalHandler(req, res);
      }
      const middleware = middlewares[index++];
      await middleware(req, res, next);
    }

    await next();
  };
}

// Example middleware: request logger
function logger(req, res, next) {
  const start = Date.now();
  console.log(`--> ${req.method} ${req.pathname}`);
  // Note: in our TCP server, "res" is the socket
  return next().then(() => {
    console.log(`<-- ${Date.now() - start}ms`);
  });
}

module.exports = { createMiddlewareChain, logger };
```

#### Connection limits and timeouts

```javascript
const MAX_CONNECTIONS = 1000;
const IDLE_TIMEOUT_MS = 5000;

const server = net.createServer((socket) => {
  if (connectionCount >= MAX_CONNECTIONS) {
    // Send 503 and immediately close
    socket.write('HTTP/1.1 503 Service Unavailable\r\nContent-Length: 0\r\nConnection: close\r\n\r\n');
    socket.end();
    return;
  }

  // Destroy idle sockets after 5 seconds of inactivity
  socket.setTimeout(IDLE_TIMEOUT_MS);
  socket.on('timeout', () => {
    socket.destroy();
  });
  // ... rest of handler
});
```

#### Load test

```bash
# Run the load test with autocannon
autocannon -c 100 -d 20 http://localhost:8080/

# -c 100 = 100 concurrent connections
# -d 20  = run for 20 seconds

# Record these numbers from the output:
# Req/sec (average), Req/sec (max), Latency p99
```

**Week 3 milestone:**
- Keep-alive works: `curl --http1.1 -v http://localhost:8080/ http://localhost:8080/` reuses one connection for both requests
- Load test produces a req/sec number — record it for your resume
- GitHub README updated with architecture diagram and benchmark result
- **Commit:** `git commit -m "Week 3: keep-alive, middleware chain, load tested at Xk req/sec"`

---

## 6. Project 2 — Custom API Gateway

Start a new project folder: `mkdir api-gateway && cd api-gateway && npm init -y`

### Week 4 — Reverse proxy scaffold

**Status:** the current `API_Gateway/src/server.js`, `API_Gateway/src/proxy.js`, `API_Gateway/src/health.js`, and `API_Gateway/src/config.js` now implement the forwarding path, config loading, and upstream health checks.

**Install packages:**
```bash
npm install express http-proxy-middleware js-yaml axios chokidar uuid
```

#### Gateway config (`gateway.yaml`)

```yaml
# gateway.yaml
routes:
  - prefix: /api/users
    target: http://localhost:3001
    auth: jwt
    rateLimit:
      requests: 100
      windowSeconds: 60
    cache:
      ttlSeconds: 30

  - prefix: /api/products
    target: http://localhost:3002
    auth: apikey
    rateLimit:
      requests: 200
      windowSeconds: 60

  - prefix: /health
    target: http://localhost:3001
    auth: public
```

**Week 4 goal:**
- Load YAML config and resolve the best route for each request.
- Forward the request to the configured upstream service.
- Add health checks so a down service returns `502 Bad Gateway` instead of hanging or crashing.
- Preserve request headers and attach a request ID for tracing.

#### Proxy core (`src/proxy.js`)

```javascript
// src/proxy.js
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { v4: uuidv4 } = require('uuid');
const yaml = require('js-yaml');
const fs = require('fs');
const axios = require('axios');
const chokidar = require('chokidar');

const app = express();

// Track upstream health
const upstreamHealth = new Map();  // target URL -> boolean

function loadConfig() {
  return yaml.load(fs.readFileSync('./gateway.yaml', 'utf8'));
}

function checkHealth(target) {
  axios.get(`${target}/health`, { timeout: 3000 })
    .then(() => upstreamHealth.set(target, true))
    .catch(() => upstreamHealth.set(target, false));
}

function startHealthChecks(config) {
  const targets = [...new Set(config.routes.map(r => r.target))];
  targets.forEach(t => {
    checkHealth(t);
    setInterval(() => checkHealth(t), 10000);  // check every 10s
  });
}

function buildRoutes(config) {
  // Clear existing routes
  app._router = null;
  app.use(express.json());

  config.routes.forEach(route => {
    app.use(route.prefix, (req, res, next) => {
      // Health check — return 502 before proxying
      if (upstreamHealth.get(route.target) === false) {
        return res.status(502).json({ error: 'Upstream service unavailable' });
      }
      next();
    });

    app.use(route.prefix, createProxyMiddleware({
      target: route.target,
      changeOrigin: true,  // rewrites Host header to match target
      on: {
        proxyReq: (proxyReq, req) => {
          // Add traceability headers to every proxied request
          proxyReq.setHeader('X-Request-ID', uuidv4());
          proxyReq.setHeader('X-Forwarded-For', req.ip || req.connection.remoteAddress);
          proxyReq.setHeader('X-Gateway-Time', Date.now().toString());
        },
        error: (err, req, res) => {
          console.error('Proxy error:', err.message);
          res.status(502).json({ error: 'Bad Gateway', message: err.message });
        },
      },
    }));
  });
}

// Initial setup
let config = loadConfig();
startHealthChecks(config);
buildRoutes(config);

// Hot reload: watch for config file changes
chokidar.watch('./gateway.yaml').on('change', () => {
  console.log('Config changed — reloading routes...');
  try {
    config = loadConfig();
    buildRoutes(config);
    console.log('Routes reloaded successfully');
  } catch (err) {
    console.error('Failed to reload config:', err.message);
  }
});

app.listen(3000, () => console.log('Gateway running on http://localhost:3000'));
```

**Week 4 milestone:**
```bash
# Start two mock upstream servers (in separate terminals)
node -e "require('express')().get('/health', (r,s)=>s.json({ok:true})).get('*',(r,s)=>s.json({service:'users',path:r.path})).listen(3001)"
node -e "require('express')().get('/health', (r,s)=>s.json({ok:true})).get('*',(r,s)=>s.json({service:'products',path:r.path})).listen(3002)"

# Test routing
curl http://localhost:3000/api/users/1    # should proxy to :3001
curl http://localhost:3000/api/products/5 # should proxy to :3002

# Test 502 (stop one upstream and wait 15s for health check)
# kill the :3001 server, then:
curl http://localhost:3000/api/users/1    # should return 502
```

---

### Week 5 — Auth middleware (JWT + API keys)

**Goal:** protect routes with the right credential type, reject bad requests with precise status codes, and inject verified identity into the upstream request.

**What this week must support:**
- Read `X-API-Key` and validate it against an in-memory map or Redis store.
- Parse `Authorization: Bearer <token>` and verify JWT signature plus expiry.
- Use `RS256` so the gateway verifies with a public key instead of sharing a symmetric secret.
- Drive auth choice from YAML per route: some routes are public, some require JWT, some require API keys.
- Return `401 Unauthorized` for missing or invalid credentials and `403 Forbidden` for valid credentials that still lack permission.
- Inject verified claims into the upstream request as `X-User-ID` and `X-User-Role`.

**Install packages:**
```bash
npm install jsonwebtoken
```

**Generate RS256 keypair:**
```bash
# Generate private key
openssl genrsa -out private.pem 2048

# Extract public key
openssl rsa -in private.pem -pubout -out public.pem

# Never commit private.pem to git — add to .gitignore
echo "private.pem" >> .gitignore
```

#### Auth middleware (`src/auth.js`)

```javascript
// src/auth.js
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');

const PUBLIC_KEY = fs.readFileSync('./public.pem', 'utf8');

// API keys stored in memory (production: use Redis or database)
const API_KEYS = new Map([
  ['key_prod_abc123', { name: 'Service A', tier: 'premium' }],
  ['key_dev_xyz789', { name: 'Dev client', tier: 'standard' }],
]);

function verifyApiKey(req, res, next) {
  const key = req.headers['x-api-key'];

  if (!key) {
    return res.status(401).json({ error: 'Missing X-API-Key header' });
  }

  // CRITICAL: timing-safe comparison prevents timing attacks
  // A timing attack: attacker measures response time to guess key char by char
  // crypto.timingSafeEqual takes the same time regardless of where strings differ
  let matched = null;
  for (const [storedKey, metadata] of API_KEYS) {
    const keyBuf = Buffer.from(key.padEnd(storedKey.length));
    const storedBuf = Buffer.from(storedKey);
    if (keyBuf.length === storedBuf.length &&
        crypto.timingSafeEqual(keyBuf, storedBuf)) {
      matched = metadata;
      break;
    }
  }

  if (!matched) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  // Inject identity into request for downstream use
  req.apiClient = matched;
  req.headers['x-client-name'] = matched.name;  // forwarded to upstream
  next();
}

function verifyJWT(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = authHeader.slice(7);  // remove "Bearer "

  try {
    // RS256: asymmetric — gateway only needs public key to verify
    // The auth server signs with private key; anyone with public key can verify
    const decoded = jwt.verify(token, PUBLIC_KEY, { algorithms: ['RS256'] });
    req.user = decoded;

    // Forward user identity to upstream services as headers
    req.headers['x-user-id'] = decoded.sub;
    req.headers['x-user-role'] = decoded.role || 'user';

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', expiredAt: err.expiredAt });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const role = req.user?.role || 'user';

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ error: 'Forbidden', message: 'Insufficient role' });
    }

    next();
  };
}

// Middleware factory: reads auth type from route config
function requireAuth(authType) {
  if (authType === 'jwt') return verifyJWT;
  if (authType === 'apikey') return verifyApiKey;
  if (authType === 'none') return (req, res, next) => next();
  throw new Error(`Unknown auth type: ${authType}`);
}

module.exports = { requireAuth };
```

**Generate a test JWT:**
```javascript
// scripts/generateToken.js — run once to get a test token
const jwt = require('jsonwebtoken');
const fs = require('fs');

const privateKey = fs.readFileSync('./private.pem', 'utf8');
const token = jwt.sign(
  { sub: 'user_123', role: 'admin', name: 'Alice' },
  privateKey,
  { algorithm: 'RS256', expiresIn: '7d' }
);

console.log('Token:', token);
```

**Week 5 milestone:**
```bash
# Valid JWT
curl http://localhost:3000/api/users/1 \
  -H "Authorization: Bearer <token_from_script>"
# Expected: 200, proxied to upstream

# Expired/invalid token
curl http://localhost:3000/api/users/1 \
  -H "Authorization: Bearer invalid.token.here"
# Expected: 401 Unauthorized

# Valid token but wrong role
curl http://localhost:3000/api/admin \
  -H "Authorization: Bearer <token_from_script>"
# Expected: 403 Forbidden

# Valid API key
curl http://localhost:3000/api/products/5 \
  -H "X-API-Key: key_prod_abc123"
# Expected: 200, proxied

# Wrong role check (add role checking to verifyJWT if needed)
# Public route — no auth needed
curl http://localhost:3000/health
# Expected: 200, no auth header required
```

---

### Week 6 — Rate limiting and caching

**Install packages:**
```bash
npm install express-rate-limit rate-limit-redis ioredis
```

#### Rate limiter (`src/rateLimiter.js`)

```javascript
// src/rateLimiter.js
const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const Redis = require('ioredis');

const redis = new Redis({ host: 'localhost', port: 6379 });

redis.on('error', (err) => console.error('Redis error:', err.message));

// Build a rate limiter for a specific route config
function createRateLimiter(routeConfig) {
  const { requests, windowSeconds } = routeConfig.rateLimit;

  return rateLimit({
    windowMs: windowSeconds * 1000,
    max: requests,

    // Key by API key if present, fall back to IP
    // Authenticated clients get higher trust and can have different limits
    keyGenerator: (req) => req.apiClient?.name || req.user?.sub || req.ip,

    // Redis store for distributed correctness
    // Without this, each gateway instance has its own counter
    store: new RedisStore({
      sendCommand: (...args) => redis.call(...args),
      prefix: `rl:${routeConfig.prefix}:`,
    }),

    // Standard rate limit headers
    standardHeaders: true,   // X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
    legacyHeaders: false,

    handler: (req, res) => {
      res.status(429).json({
        error: 'Too Many Requests',
        retryAfter: Math.ceil(windowSeconds),
        limit: requests,
      });
    },
  });
}

module.exports = { createRateLimiter, redis };
```

#### Response cache (`src/cache.js`)

```javascript
// src/cache.js
const { redis } = require('./rateLimiter');

function cacheMiddleware(ttlSeconds) {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') return next();

    // Honour Cache-Control: no-cache from client
    if (req.headers['cache-control'] === 'no-cache') {
      res.setHeader('X-Cache', 'BYPASS');
      return next();
    }

    // Build cache key from method + path + query
    const key = `cache:${req.method}:${req.path}:${JSON.stringify(req.query)}`;

    try {
      const cached = await redis.get(key);

      if (cached) {
        // Cache HIT — return stored response
        const { status, headers, body } = JSON.parse(cached);
        res.setHeader('X-Cache', 'HIT');
        Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
        return res.status(status).send(body);
      }

      // Cache MISS — intercept the response to store it
      res.setHeader('X-Cache', 'MISS');
      const originalJson = res.json.bind(res);

      res.json = async (data) => {
        // Store in Redis before sending
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const toStore = {
            status: res.statusCode,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          };
          await redis.setex(key, ttlSeconds, JSON.stringify(toStore));
        }
        return originalJson(data);
      };

      next();
    } catch (err) {
      console.error('Cache error:', err.message);
      next();  // fail open — don't let cache errors block requests
    }
  };
}

module.exports = { cacheMiddleware };
```

**Week 6 milestone:**
```bash
# First request — cache MISS
curl -v http://localhost:3000/api/products/5 -H "X-API-Key: key_prod_abc123"
# Look for: X-Cache: MISS

# Second request — cache HIT (same URL)
curl -v http://localhost:3000/api/products/5 -H "X-API-Key: key_prod_abc123"
# Look for: X-Cache: HIT  (response comes from Redis, upstream not called)

# Bypass cache
curl -v http://localhost:3000/api/products/5 \
  -H "X-API-Key: key_prod_abc123" \
  -H "Cache-Control: no-cache"
# Look for: X-Cache: BYPASS

# Trigger rate limit (run 101 times quickly)
for i in $(seq 1 105); do curl -s -o /dev/null -w "%{http_code}\n" \
  http://localhost:3000/api/products/$i -H "X-API-Key: key_prod_abc123"; done
# First 100: 200, then 429 with Retry-After header
```

---

### Week 7 — Metrics, load test, and deploy

**Install packages:**
```bash
npm install prom-client
```

#### Prometheus metrics (`src/metrics.js`)

```javascript
// src/metrics.js
const client = require('prom-client');

// Collect default Node.js metrics (memory, CPU, event loop lag)
client.collectDefaultMetrics({ prefix: 'gateway_' });

// Custom metrics
const httpRequestsTotal = new client.Counter({
  name: 'gateway_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

const httpRequestDuration = new client.Histogram({
  name: 'gateway_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  // These buckets let you compute p50, p95, p99 in Grafana
});

const cacheHits = new client.Counter({
  name: 'gateway_cache_hits_total',
  help: 'Total cache hits',
  labelNames: ['route'],
});

const cacheMisses = new client.Counter({
  name: 'gateway_cache_misses_total',
  help: 'Total cache misses',
  labelNames: ['route'],
});

const rateLimitHits = new client.Counter({
  name: 'gateway_rate_limit_hits_total',
  help: 'Total rate limit rejections',
  labelNames: ['route'],
});

// Middleware that records metrics for every request
function metricsMiddleware(req, res, next) {
  const start = Date.now();
  const route = req.route?.path || req.path;

  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const labels = { method: req.method, route, status_code: res.statusCode };

    httpRequestsTotal.inc(labels);
    httpRequestDuration.observe(labels, duration);

    if (res.getHeader('X-Cache') === 'HIT') cacheHits.inc({ route });
    if (res.getHeader('X-Cache') === 'MISS') cacheMisses.inc({ route });
    if (res.statusCode === 429) rateLimitHits.inc({ route });
  });

  next();
}

// Expose /metrics endpoint for Prometheus to scrape
function metricsEndpoint(req, res) {
  res.set('Content-Type', client.register.contentType);
  client.register.metrics().then(m => res.end(m));
}

module.exports = { metricsMiddleware, metricsEndpoint };
```

Add to your gateway:
```javascript
const { metricsMiddleware, metricsEndpoint } = require('./src/metrics');
app.use(metricsMiddleware);
app.get('/metrics', metricsEndpoint);
```

#### Docker Compose (`docker-compose.yml`)

```yaml
# docker-compose.yml
version: '3.8'

services:
  gateway:
    build: .
    ports:
      - "3000:3000"
    environment:
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
    volumes:
      - ./gateway.yaml:/app/gateway.yaml  # hot reload still works

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  prometheus:
    image: prom/prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml

  grafana:
    image: grafana/grafana
    ports:
      - "3001:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    depends_on:
      - prometheus
```

```yaml
# prometheus.yml
global:
  scrape_interval: 5s

scrape_configs:
  - job_name: 'api-gateway'
    static_configs:
      - targets: ['gateway:3000']
    metrics_path: /metrics
```

#### Dockerfile

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["node", "src/server.js"]
```

#### Load test

```bash
# Start everything
docker compose up -d

# Run load test against the gateway
autocannon -c 200 -d 30 http://localhost:3000/api/products/1 \
  -H "X-API-Key: key_prod_abc123"

# Record: Req/sec and p99 latency
# These numbers go directly on your resume
```

**Week 7 milestone — all of these before shipping:**
- [ ] `docker compose up` starts everything in one command
- [ ] `/metrics` returns Prometheus-formatted data
- [ ] Grafana dashboard shows req/sec, p99 latency, error rate, cache hit rate
- [ ] Load test numbers recorded (req/sec + p99 latency)
- [ ] Deployed to Railway or Render — live URL exists
- [ ] README has architecture diagram, feature table, benchmark screenshot, live URL

**Final commit:** `git commit -m "Week 7: metrics dashboard, load tested, deployed to [URL]"`

---

## 7. File Structure

### Project 1 — HTTP Server

```
http-from-scratch/
├── src/
│   ├── server.js        TCP server, connection handling, main loop
│   ├── parser.js        Raw HTTP request parsing
│   ├── response.js      HTTP response writer helpers
│   ├── router.js        Route matching with path parameters
│   ├── bodyParser.js    JSON and form body parsing
│   └── middleware.js    Middleware chain implementation
├── test/
│   └── parser.test.js   Unit tests for the parser
├── package.json
└── README.md            Architecture diagram + benchmark results
```

### Project 2 — API Gateway

```
api-gateway/
├── src/
│   ├── server.js        Express app entrypoint
│   ├── proxy.js         Reverse proxy core and config loader
│   ├── auth.js          JWT and API key middleware
│   ├── rateLimiter.js   Token bucket + Redis sliding window
│   ├── cache.js         Redis response cache
│   └── metrics.js       Prometheus metrics
├── scripts/
│   └── generateToken.js Generates test JWT tokens
├── gateway.yaml         Route configuration (hot-reloaded)
├── private.pem          RS256 private key — NEVER commit
├── public.pem           RS256 public key — safe to commit
├── prometheus.yml       Prometheus scrape config
├── docker-compose.yml   Full stack: gateway + Redis + Prometheus + Grafana
├── Dockerfile
├── .gitignore           Must include: private.pem, node_modules, .env
├── package.json
└── README.md            Architecture diagram + live URL + benchmarks
```

---

## 8. npm Packages Reference

### Project 1 — zero npm dependencies
Everything uses `node:net` from the standard library.

### Project 2

| Package | Purpose | Used in |
|---------|---------|---------|
| `express` | HTTP framework and middleware chain | Core gateway |
| `http-proxy-middleware` | Reverse proxy with hooks | Week 4 |
| `js-yaml` | Parse gateway.yaml config | Week 4 |
| `axios` | Health check HTTP calls | Week 4 |
| `chokidar` | Watch config file for hot reload | Week 4 |
| `uuid` | Generate X-Request-ID | Week 4 |
| `jsonwebtoken` | JWT signing and verification | Week 5 |
| `ioredis` | Redis client | Week 6 |
| `express-rate-limit` | Rate limiting middleware | Week 6 |
| `rate-limit-redis` | Redis store for rate limiter | Week 6 |
| `prom-client` | Prometheus metrics collection | Week 7 |

**Dev only:**
```bash
npm install --save-dev autocannon nodemon
```

---

## 9. Testing Checklist

Run through every item before calling a week complete.

### Project 1 complete checklist

- [ ] `curl -v http://localhost:8080/` returns 200 with correct Content-Length
- [ ] `curl -v http://localhost:8080/unknown` returns 404 with JSON body
- [ ] `curl -X POST ... -d '{...}'` — body parsed correctly
- [ ] Path params: `curl http://localhost:8080/users/42` returns `{ "userId": "42" }`
- [ ] Wrong method: `curl -X DELETE http://localhost:8080/` returns 405 with Allow header
- [ ] Two simultaneous curl calls both get valid responses with no data mixing
- [ ] Browser loads `http://localhost:8080` without "connection reset" error
- [ ] Load test runs without crashing: `autocannon -c 100 -d 10 http://localhost:8080/`
- [ ] README has benchmark number (req/sec and p99)

### Project 2 complete checklist

- [ ] Gateway proxies to two different upstreams based on path prefix
- [ ] 502 returned when upstream is down (stop it and wait 15s for health check)
- [ ] Config hot-reload: edit gateway.yaml, new routes work without restarting
- [ ] Valid JWT → 200, invalid JWT → 401, expired JWT → 401 with expiredAt
- [ ] Valid API key → 200, invalid key → 401, missing key → 401
- [ ] 401 vs 403 correct: 401 = no/bad token, 403 = valid token but wrong role
- [ ] Rate limit triggers at the configured threshold → 429 with Retry-After
- [ ] X-RateLimit-Remaining header counts down correctly
- [ ] Cache HIT on second identical GET request (X-Cache: HIT in response)
- [ ] Cache-Control: no-cache bypasses cache (X-Cache: BYPASS)
- [ ] `/metrics` returns Prometheus-format data
- [ ] `docker compose up` starts everything — gateway, Redis, Prometheus, Grafana
- [ ] Grafana dashboard shows live req/sec and latency charts
- [ ] Load test number recorded: req/sec and p99 latency
- [ ] Service deployed — live URL accessible

---

## 10. Resume and Interview Guide

### Resume bullets (use your actual numbers)

**HTTP Server:**
> Built an HTTP/1.1 server from raw TCP sockets using only Node.js stdlib — no frameworks. Implemented request parsing (request line, headers, body), keep-alive connections, a middleware chain, and path parameter routing. Load tested at 8,000 req/sec with p99 latency under 12ms.

**API Gateway:**
> Built a production-grade API gateway in Node.js/Express handling auth (JWT RS256 + API keys with timing-safe comparison), Redis-backed rate limiting (sliding window), response caching, and Prometheus metrics. Deployed with Docker Compose. Handles 6,000 req/sec with p99 under 20ms.

### Interview questions you will now answer confidently

**From the HTTP server:**

| Question | Your answer draws from |
|----------|----------------------|
| How does Express handle concurrent requests in a single thread? | Your event loop understanding + socket.on('data') implementation |
| What happens if a client sends headers across two TCP packets? | Your Day 2 chunking fix (buffer until \r\n\r\n) |
| Why use Buffer.byteLength instead of string.length for Content-Length? | Your response.js implementation |
| What is the middleware pattern? How does next() work? | Your middleware.js implementation |
| What is keep-alive and why does it improve performance? | Your Week 3 implementation |

**From the API gateway:**

| Question | Your answer draws from |
|----------|----------------------|
| What is the difference between 401 and 403? | Your auth.js (both implemented precisely) |
| Why use RS256 instead of HS256 for JWT? | Your Week 5 keypair generation and auth.js |
| What is a timing attack? How do you prevent it? | Your crypto.timingSafeEqual implementation |
| How does rate limiting work in a distributed system? | Your Redis sliding window implementation |
| What is p99 latency? Why is it better than average? | Your Week 7 Grafana dashboard and load test |
| How would you prevent a client from taking down your API? | Your rate limiter with per-key and per-IP limiting |

### The 30-second project pitch

> "I built two projects together that tell one story: I understand how the web works at every layer. First, I built an HTTP/1.1 server on raw TCP sockets in Node — no frameworks, just net.createServer and Buffers. I parsed raw bytes, implemented keep-alive, and built a middleware chain from scratch. That gave me a deep understanding of what Express actually does. Then I used Express to build an API gateway — the same thing AWS API Gateway and Kong do commercially. It handles auth with JWT RS256, Redis-backed rate limiting, response caching, and exposes Prometheus metrics. Both are deployed and load tested."

---

*Documentation version 1.0 — covers Weeks 1 through 7*