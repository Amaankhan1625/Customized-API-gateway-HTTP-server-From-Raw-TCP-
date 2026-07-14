const net = require('net');
const { parseHttpRequest } = require('./http/parser');
const { createRouter } = require('./http/router');
const { createResponse } = require('./http/response');

const PORT = Number(process.env.PORT || 8080);
const MAX_CONNECTIONS = Number(process.env.MAX_CONNECTIONS || 100);
const KEEP_ALIVE_TIMEOUT = 5000;
const router = createRouter();

let activeConnections = 0;

// Handles the root route so clients can quickly verify the server is running.
router.get('/', function handleRootRoute({ response }) {
  response.send(200, {}, 'Raw TCP HTTP server is running.');
});

// Returns the matched user id to prove path parameters are parsed correctly.
router.get('/users/:id', function handleUserRoute({ response, params }) {
  response.send(200, {}, `User ID: ${params.id}`);
});

// Echoes the request body back so request body parsing can be verified end to end.
router.post('/echo', function handleEchoRoute({ response, request }) {
  response.send(200, {}, request.body || '');
});

// Extracts one complete HTTP request from the incoming socket buffer.
function readRequestFromBuffer(buffer) {
  const headerEndIndex = buffer.indexOf('\r\n\r\n');

  if (headerEndIndex === -1) {
    return null;
  }

  const headerText = buffer.slice(0, headerEndIndex).toString('utf8');
  const request = parseHttpRequest(headerText);
  const contentLength = Number(request.headers['content-length'] || 0);
  const bodyStartIndex = headerEndIndex + 4;
  const requiredLength = bodyStartIndex + contentLength;

  if (buffer.length < requiredLength) {
    return null;
  }

  const bodyBuffer = buffer.slice(bodyStartIndex, requiredLength);
  const body = bodyBuffer.toString('utf8');

  return {
    request: {
      ...request,
      body,
    },
    remainingBuffer: buffer.slice(requiredLength),
  };
}

// Decides whether the socket should stay open after the current response is sent.
function shouldKeepAlive(request) {
  const connectionHeader = String(request.headers.connection || '').toLowerCase();

  if (connectionHeader === 'close') {
    return false;
  }

  if (connectionHeader === 'keep-alive') {
    return true;
  }

  return request.version === 'HTTP/1.1';
}

// Builds the response wrapper that enforces one response per request and handles keep-alive.
function createResponseContext(socket, request) {
  let responseSent = false;

  // Sends the response once and closes the socket only when keep-alive is not allowed.
  function send(status, headers = {}, body = '') {
    if (responseSent || socket.destroyed) {
      return;
    }

    responseSent = true;
    const keepAlive = shouldKeepAlive(request);
    const responseHeaders = {
      ...headers,
      Connection: keepAlive ? 'keep-alive' : 'close',
    };
    const responseText = createResponse(status, responseHeaders, body);

    if (keepAlive) {
      socket.write(responseText);
      return;
    }

    socket.end(responseText);
  }

  return {
    socket,
    request,
    send,
    // Exposes the response state so callers can detect whether a handler already replied.
    get responseSent() {
      return responseSent;
    },
  };
}

// Logs each request before routing so connection behavior is easy to trace.
async function logRequest(request, response, next) {
  console.log(`${request.method} ${request.path}`);
  await next();
}

// Finds the matching route and executes it, or returns the correct 404/405 response.
async function dispatchRoute(request, response) {
  const routeMatch = router.matchRoute(request.method, request.path);

  if (!routeMatch.handler) {
    response.send(routeMatch.statusCode, {}, routeMatch.statusCode === 405 ? 'Method Not Allowed' : 'Not Found');
    return;
  }

  await routeMatch.handler({
    socket: response.socket,
    request,
    response,
    params: routeMatch.params,
  });
}

const middlewares = [logRequest, dispatchRoute];

// Runs the middleware chain in order so request handling stays composable.
async function runMiddlewareChain(request, response) {
  const chain = middlewares.reduceRight(
    (next, middleware) => async () => {
      await middleware(request, response, next);
    },
    () => Promise.resolve()
  );

  await chain();
}

// Processes a parsed request and guarantees that every request receives a response.
async function handleRequest(socket, rawRequest) {
  const response = createResponseContext(socket, rawRequest);
  try {
    await runMiddlewareChain(rawRequest, response);

    if (!response.responseSent && !socket.destroyed) {
      response.send(500, {}, 'The server did not send a response.');
    }
  } catch (error) {
    console.error('Unhandled error in middleware chain:', error);
    if (!response.responseSent && !socket.destroyed) {
      // Avoid sending a response if the socket is already closed
      response.send(500, {}, 'Internal Server Error');
    }
  }

  return !socket.destroyed && shouldKeepAlive(rawRequest);
}

// Sends a minimal 503 response when the server is at its connection limit.
function rejectConnection(socket) {
  const response = createResponse(503, { Connection: 'close' }, 'Service Unavailable');
  socket.end(response);
}

// Handles a new socket connection and wires the request lifecycle for that client.
function handleConnection(socket) {
  if (activeConnections >= MAX_CONNECTIONS) {
    rejectConnection(socket);
    return;
  }

  activeConnections += 1;

  const connectionInfo = `${socket.remoteAddress || 'unknown'}:${socket.remotePort || 'unknown'}`;

  console.log(`Client connected (${connectionInfo}). Active connections: ${activeConnections}`);

  socket.setTimeout(KEEP_ALIVE_TIMEOUT, () => {
    socket.destroy();
  });

  let buffer = Buffer.alloc(0);
  let processing = Promise.resolve();

  // Buffers incoming TCP chunks and processes complete requests sequentially.
  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    processing = processing
      .then(async () => {
        while (buffer.length > 0 && !socket.destroyed) {
          const parsed = readRequestFromBuffer(buffer);

          if (!parsed) {
            return;
          }

          buffer = parsed.remainingBuffer;
          const keepAlive = await handleRequest(socket, parsed.request);

          if (!keepAlive) {
            buffer = Buffer.alloc(0);
            return;
          }
        }
      })
      .catch((error) => {
        console.error('Request processing error:', error.message);
        socket.destroy();
      });
  });

  // Logs socket errors so the connection can be diagnosed without crashing the server.
  socket.on('error', (error) => {
    console.error('Socket error:', error.message);
  });

  // Decrements the active connection count when the client disconnects.
  socket.on('close', () => {
    activeConnections = Math.max(0, activeConnections - 1);
    console.log(`Client disconnected (${connectionInfo}). Active connections: ${activeConnections}`);
  });
}

const server = net.createServer(handleConnection);

server.listen(PORT, () => {
  console.log(`TCP HTTP server listening on port ${PORT} (max connections: ${MAX_CONNECTIONS})`);
});
