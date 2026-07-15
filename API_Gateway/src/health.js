const http = require('http');
const https = require('https');
const { URL } = require('url');

function requestAgentFor(targetUrl) {
  return targetUrl.protocol === 'https:' ? https : http;
}

function probeTarget(target, healthPath, timeoutMs) {
  return new Promise((resolve) => {
    const targetUrl = new URL(target);
    const path = `${healthPath.startsWith('/') ? healthPath : `/${healthPath}`}`;
    const client = requestAgentFor(targetUrl);

    const request = client.request({
      protocol: targetUrl.protocol,
      hostname: targetUrl.hostname,
      port: targetUrl.port || undefined,
      method: 'GET',
      path,
      timeout: timeoutMs,
      headers: {
        'User-Agent': 'custom-api-gateway/1.0',
        'Accept': 'application/json, text/plain, */*',
      },
    }, (response) => {
      response.resume();
      resolve(response.statusCode >= 200 && response.statusCode < 400);
    });

    request.on('timeout', () => {
      request.destroy(new Error('health check timeout'));
    });

    request.on('error', () => resolve(false));
    request.end();
  });
}

function startHealthChecks(routes, state, options = {}) {
  const intervalMs = Number(options.intervalMs || 10000);
  const timeoutMs = Number(options.timeoutMs || 3000);

  if (state.healthIntervals) {
    for (const timer of state.healthIntervals.values()) {
      clearInterval(timer);
    }
  }

  state.healthIntervals = new Map();
  state.targetHealth = new Map();

  const uniqueTargets = new Map();
  for (const route of routes) {
    if (!uniqueTargets.has(route.target)) {
      uniqueTargets.set(route.target, route.healthPath || '/health');
    }
  }

  const refreshTarget = async (target, healthPath) => {
    const healthy = await probeTarget(target, healthPath, timeoutMs);
    state.targetHealth.set(target, {
      healthy,
      checkedAt: Date.now(),
    });
    return healthy;
  };

  for (const [target, healthPath] of uniqueTargets.entries()) {
    refreshTarget(target, healthPath);
    const timer = setInterval(() => {
      refreshTarget(target, healthPath);
    }, intervalMs);
    state.healthIntervals.set(target, timer);
  }
}

function isUpstreamHealthy(route, state) {
  const health = state.targetHealth.get(route.target);
  if (!health) {
    return true;
  }

  return health.healthy;
}

module.exports = { startHealthChecks, isUpstreamHealthy };
