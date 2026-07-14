// Splits a path into segments so static and parameterized routes can be compared consistently.
function splitPath(path) {
  return path.split('/').filter(Boolean);
}

// Stores route handlers and resolves them by method plus path.
function createRouter() {
  const routes = new Map();

  // Registers a route handler under an exact method/path key.
  function registerRoute(method, path, handler) {
    routes.set(`${method.toUpperCase()} ${path}`, handler);
  }

  // Finds the best route match and distinguishes 404 from 405 when the path exists.
  function matchRoute(method, path) {
    const normalizedMethod = method.toUpperCase();
    const exactKey = `${normalizedMethod} ${path}`;

    if (routes.has(exactKey)) {
      return {
        handler: routes.get(exactKey),
        params: {},
        statusCode: 200,
      };
    }

    const requestSegments = splitPath(path);
    let pathExists = false;

    for (const [routeKey, handler] of routes.entries()) {
      const [routeMethod, routePath] = routeKey.split(' ');
      if (routeMethod !== normalizedMethod) {
        continue;
      }

      const routeSegments = splitPath(routePath);
      if (routeSegments.length !== requestSegments.length) {
        continue;
      }

      let isMatch = true;
      const params = {};

      for (let index = 0; index < routeSegments.length; index += 1) {
        const routeSegment = routeSegments[index];
        const requestSegment = requestSegments[index];

        if (routeSegment.startsWith(':')) {
          params[routeSegment.slice(1)] = requestSegment;
          continue;
        }

        if (routeSegment !== requestSegment) {
          isMatch = false;
          break;
        }
      }

      if (isMatch) {
        return {
          handler,
          params,
          statusCode: 200,
        };
      }
    }

    for (const routeKey of routes.keys()) {
      const [, routePath] = routeKey.split(' ');
      const routeSegments = splitPath(routePath);

      if (routeSegments.length !== requestSegments.length) {
        continue;
      }

      let isSamePath = true;
      for (let index = 0; index < routeSegments.length; index += 1) {
        const routeSegment = routeSegments[index];
        const requestSegment = requestSegments[index];

        if (routeSegment.startsWith(':')) {
          continue;
        }

        if (routeSegment !== requestSegment) {
          isSamePath = false;
          break;
        }
      }

      if (isSamePath) {
        pathExists = true;
        break;
      }
    }

    return {
      handler: null,
      params: {},
      statusCode: pathExists ? 405 : 404,
    };
  }

  return {
    routes,
    // Registers a GET route.
    get(path, handler) {
      registerRoute('GET', path, handler);
    },
    // Registers a POST route.
    post(path, handler) {
      registerRoute('POST', path, handler);
    },
    matchRoute,
  };
}

module.exports = {
  createRouter,
};
