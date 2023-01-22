import https from 'https';
import http from 'http';
import httpProxy from 'http-proxy';

function createProxy (router, request, response) {
  let route;
  let url;
  try {
    url = `https://${request.headers.host}${request.url || ''}`;
    route = router.getRoutes().find(route => url.match(route.incomingHost));
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
      hostname: route.target.hostname,
      port: route.target.port
    }
  });
}

function createProxyServer (router, certificates) {
  if (Object.keys(certificates) === 0) {
    throw new Error('Could not createProxySever as no secureContexts could be generated');
  }

  http.createServer((request, response) => {
    response.writeHead(302, {
      Location: 'https://' + request.headers.host + request.url
    });
    response.end();
  }).listen(80);
  console.log('Listening on port 80');

  function httpsHandler (request, response) {
    const proxy = createProxy(router, request, response);
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

  const server = https.createServer({
    SNICallback: (serverName, callback) => {
      const firstCertificateKey = Object.keys(certificates)[0];

      const matchingCertificateKey = Object.keys(certificates).find(key => {
        return key === serverName || key === `*.${serverName}`;
      });
      const matchingCertificate = certificates[matchingCertificateKey] || certificates[firstCertificateKey];

      return callback(null, matchingCertificate.secureContext);
    }
  }, httpsHandler).listen(443);

  server.on('upgrade', function (request, socket, head) {
    const proxy = createProxy(router, request);
    if (!proxy) {
      return;
    }

    proxy.ws(request, socket, head);
  });

  console.log('Listening on port 443');
}

export default createProxyServer;
