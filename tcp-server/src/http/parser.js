// Converts a raw HTTP request string into structured request fields used by the server.
function parseHttpRequest(rawRequest) {
  const [requestLine = '', ...headerLines] = rawRequest.split('\r\n');
  const [method = '', target = '', version = ''] = requestLine.split(' ');
  const [path = '/', queryString = ''] = target.split('?');

  const headers = {};

  for (const line of headerLines) {
    if (!line) {
      continue;
    }

    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }

    const headerName = line.slice(0, separatorIndex).trim().toLowerCase();
    const headerValue = line.slice(separatorIndex + 1).trim();
    headers[headerName] = headerValue;
  }

  const query = {};
  if (queryString) {
    for (const [key, value] of new URLSearchParams(queryString)) {
      query[key] = value;
    }
  }

  return {
    method,
    path,
    version,
    query,
    headers,
  };
}

module.exports = {
  parseHttpRequest,
};
