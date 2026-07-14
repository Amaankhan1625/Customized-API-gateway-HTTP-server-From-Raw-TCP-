// Maps status codes to the short reason phrase used in the HTTP status line.
function getStatusText(statusCode) {
  const statusTexts = {
    200: 'OK',
    201: 'Created',
    400: 'Bad Request',
    404: 'Not Found',
    405: 'Method Not Allowed',
    500: 'Internal Server Error',
  };

  return statusTexts[statusCode] || 'OK';
}

// Serializes a status, headers, and body into a valid HTTP/1.1 response string.
function createResponse(status, headers = {}, body = '') {
  const responseBody = body == null ? '' : String(body);
  const responseHeaders = {
    'Content-Type': 'text/plain; charset=utf-8',
    ...headers,
    'Content-Length': Buffer.byteLength(responseBody),
  };

  const headerLines = Object.entries(responseHeaders).map(([name, value]) => `${name}: ${value}`);
  return [`HTTP/1.1 ${status} ${getStatusText(status)}`, ...headerLines, '', responseBody].join('\r\n');
}

// Writes a fully formatted HTTP response directly to the socket.
function writeResponse(socket, status, headers = {}, body = '') {
  socket.write(createResponse(status, headers, body));
}

module.exports = {
  createResponse,
  writeResponse,
};
