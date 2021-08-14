const https = require('https');
const http = require('http');
const httpProxy = require('http-proxy');

const options = require('../config');

function createProxy (routes, request, response) {
  let route;
  let url;
  try {
    url = `https://${request.headers.host}${request.url || ''}`;
    route = routes.find(route => url.match(route.incomingUrl));
  } catch (error) {
    console.log(error);
  }

  if (!route) {
    if (response) {
      response.writeHead(404);
      response.end('404 Not Found - No route available to take this request');
    }
    return;
  }

  return httpProxy.createProxyServer({
    target: {
      hostname: route.serviceName,
      port: 80
    }
  });
}

function createProxyServer (routes) {
  http.createServer((request, response) => {
    response.writeHead(302, {
      Location: 'https://' + request.headers.host + request.url
    });
    response.end();
  }).listen(80);
  console.log('Listening on port 80');

  function httpsHandler (request, response) {
    const proxy = createProxy(routes, request, response);
    if (!proxy) {
      return;
    }

    proxy.on('error', function (error, request, response) {
      console.log(error.message);
      response.writeHead(503, {
        'Content-Type': 'text/html'
      });

      response.end(`
        <h1>502 Bad Gateway</h1>
        <p>The server was acting as a gateway or proxy and received an invalid response from the upstream server.</p>
      `);
    });

    proxy.web(request, response);
  }

  const server = https.createServer(options, httpsHandler).listen(443);
  server.on('upgrade', function (request, socket, head) {
    const proxy = createProxy(routes, request);
    if (!proxy) {
      return;
    }

    proxy.ws(request, socket, head);
  });

  console.log('Listening on port 443');
}

module.exports = createProxyServer;
