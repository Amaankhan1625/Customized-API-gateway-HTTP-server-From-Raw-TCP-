const http = require('http');
const fs = require('fs');
const path = require('path');

const { loadConfig, findBestRoute } = require('./config');
const { startHealthChecks, isUpstreamHealthy } = require('./health');
const { proxyRequest } = require('./proxy');
const { verifyRouteAuth, createUnauthorizedResponse, createForbiddenResponse } = require('./auth');

const PORT = Number(process.env.PORT || 8081);
const CONFIG_PATH = process.env.GATEWAY_CONFIG || path.join(__dirname, '..', 'gateway.yaml');

const gatewayState = {
  routes: [],
  targetHealth: new Map(),
  healthIntervals: new Map(),
  configVersion: 0,
};

function getRequestUrl(req) {
  return new URL(req.url, `http://${req.headers.host || 'localhost'}`);
}

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function sendNotFound(res, pathname) {
  sendJson(res, 404, {
    error: 'Not Found',
    message: `No route matches ${pathname}`,
  });
}

function sendBadGateway(res, message) {
  sendJson(res, 502, {
    error: 'Bad Gateway',
    message,
  });
}

function reloadGatewayConfig() {
  const config = loadConfig(CONFIG_PATH);
  gatewayState.routes = config.routes;
  gatewayState.configVersion += 1;
  startHealthChecks(gatewayState.routes, gatewayState, {
    intervalMs: Number(process.env.HEALTH_CHECK_INTERVAL || 10000),
    timeoutMs: Number(process.env.HEALTH_CHECK_TIMEOUT || 3000),
  });
  console.log(`Loaded ${gatewayState.routes.length} gateway routes from ${CONFIG_PATH}`);
}

function watchConfigFile() {
  fs.watch(CONFIG_PATH, { persistent: false }, () => {
    try {
      reloadGatewayConfig();
      console.log('Gateway config reloaded');
    } catch (error) {
      console.error(`Failed to reload gateway config: ${error.message}`);
    }
  });
}

function handleRequest(req, res) {
  if (req.method === 'GET' && req.url === '/health') {
    return sendJson(res, 200, { status: 'ok', service: 'api-gateway' });
  }

  const requestUrl = getRequestUrl(req);
  const route = findBestRoute(requestUrl.pathname, gatewayState.routes);

  if (!route) {
    return sendNotFound(res, requestUrl.pathname);
  }

  if (!isUpstreamHealthy(route, gatewayState)) {
    return sendBadGateway(res, `Upstream ${route.target} is currently down`);
  }

  let identity;
  try {
    identity = verifyRouteAuth(req, route);
  } catch (error) {
    if (error.statusCode === 401) {
      return createUnauthorizedResponse(res, error.message, error.details);
    }

    if (error.statusCode === 403) {
      return createForbiddenResponse(res, error.message, error.details);
    }

    return sendBadGateway(res, error.message || 'Authentication failed');
  }

  return proxyRequest(req, res, route, identity);
}

function bootstrap() {
  reloadGatewayConfig();
  watchConfigFile();

  const server = http.createServer(handleRequest);

  server.listen(PORT, () => {
    console.log(`API gateway listening on port ${PORT}`);
  });
}

bootstrap();
