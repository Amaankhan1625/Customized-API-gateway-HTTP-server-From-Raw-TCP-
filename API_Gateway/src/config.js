const fs = require('fs');
const path = require('path');

const DEFAULT_CONFIG_PATH = path.join(__dirname, '..', 'gateway.yaml');

function parseScalar(value) {
  const trimmed = value.trim();

  if (trimmed === 'true') {
    return true;
  }

  if (trimmed === 'false') {
    return false;
  }

  if (trimmed === 'null' || trimmed === '~') {
    return null;
  }

  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) {
      return [];
    }

    return inner.split(',').map((item) => parseScalar(item));
  }

  return trimmed;
}

function getIndentation(line) {
  const match = line.match(/^\s*/);
  return match ? match[0].length : 0;
}

function parseInlinePair(text) {
  const separatorIndex = text.indexOf(':');
  if (separatorIndex === -1) {
    return null;
  }

  return {
    key: text.slice(0, separatorIndex).trim(),
    value: parseScalar(text.slice(separatorIndex + 1).trim()),
  };
}

function parseGatewayConfig(rawText) {
  const root = {};
  const stack = [{ indent: -1, value: root }];
  const lines = rawText.split(/\r?\n/);

  for (const rawLine of lines) {
    if (!rawLine.trim() || rawLine.trim().startsWith('#')) {
      continue;
    }

    const indent = getIndentation(rawLine);
    const trimmed = rawLine.trim();

    while (stack.length > 0 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const current = stack[stack.length - 1]?.value;
    if (!current) {
      throw new Error('Invalid gateway.yaml structure');
    }

    if (trimmed.startsWith('- ')) {
      if (!Array.isArray(current)) {
        throw new Error(`Unexpected list item: ${trimmed}`);
      }

      const item = {};
      current.push(item);

      const inline = trimmed.slice(2).trim();
      if (inline) {
        const pair = parseInlinePair(inline);
        if (!pair) {
          throw new Error(`Invalid list item: ${trimmed}`);
        }

        item[pair.key] = pair.value;
      }

      stack.push({ indent, value: item });
      continue;
    }

    const pair = parseInlinePair(trimmed);
    if (!pair) {
      throw new Error(`Invalid YAML line: ${trimmed}`);
    }

    if (pair.value === '') {
      const container = pair.key === 'routes' ? [] : {};
      current[pair.key] = container;
      stack.push({ indent, value: container });
      continue;
    }

    current[pair.key] = pair.value;
  }

  const routes = Array.isArray(root.routes) ? root.routes : [];
  if (routes.length === 0) {
    throw new Error('gateway.yaml must define at least one route');
  }

  return {
    routes: routes.map((route, index) => normalizeRoute(route, index)),
  };
}

function normalizeAuth(authValue) {
  const normalized = String(authValue || 'public').trim().toLowerCase();

  if (normalized === 'none') {
    return 'public';
  }

  if (normalized === 'public' || normalized === 'jwt' || normalized === 'apikey') {
    return normalized;
  }

  throw new Error(`Unsupported auth type: ${authValue}`);
}

function normalizeRoles(rolesValue) {
  if (!rolesValue && rolesValue !== 0) {
    return [];
  }

  if (Array.isArray(rolesValue)) {
    return rolesValue.map((role) => String(role).trim()).filter(Boolean);
  }

  return String(rolesValue)
    .split(',')
    .map((role) => role.trim())
    .filter(Boolean);
}

function normalizeRoute(route, index) {
  const prefix = route.prefix || route.pathPrefix;
  const target = route.target || route.upstream;

  if (!prefix || !target) {
    throw new Error(`Route at index ${index} must include prefix/pathPrefix and target/upstream`);
  }

  return {
    prefix: normalizePrefix(prefix),
    target: String(target).trim(),
    auth: normalizeAuth(route.auth),
    roles: normalizeRoles(route.roles || route.role || route.allowedRoles || route.requiredRoles),
    healthPath: route.healthPath ? normalizePrefix(route.healthPath) : '/health',
  };
}

function normalizePrefix(prefix) {
  const normalized = String(prefix).trim();

  if (!normalized) {
    return '/';
  }

  if (!normalized.startsWith('/')) {
    return `/${normalized.replace(/^\/+/, '')}`;
  }

  return normalized.length > 1 ? normalized.replace(/\/+$/, '') : '/';
}

function loadConfig(configPath = DEFAULT_CONFIG_PATH) {
  const rawText = fs.readFileSync(configPath, 'utf8');
  return parseGatewayConfig(rawText);
}

function findBestRoute(pathname, routes) {
  let bestRoute = null;

  for (const route of routes) {
    const prefix = route.prefix === '/' ? '/' : route.prefix.replace(/\/+$/, '');
    const matches = prefix === '/'
      ? true
      : pathname === prefix || pathname.startsWith(`${prefix}/`);

    if (!matches) {
      continue;
    }

    if (!bestRoute || prefix.length > bestRoute.prefix.length) {
      bestRoute = route;
    }
  }

  return bestRoute;
}

module.exports = {
  loadConfig,
  findBestRoute,
  normalizePrefix,
};
