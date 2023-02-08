import https from 'https';
import http from 'http';
import httpProxy from 'http-proxy';
import matchWildcardDomain from '../utils/matchWildcardDomain.js';

function createProxy (router, request, response) {
  let route;
  let url;
  let match;

  try {
    url = `https://${request.headers.host}${request.url || ''}`;
    route = router.getRoutes().find(route => {
      match = url.match(route.incomingHost);
      return match;
    });
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

  const proxyUrl = new URL(route.target.href.replace(/\$(.*)/, (_, b) => {
    return match[b];
  }));

  request.url = proxyUrl.pathname + proxyUrl.search;

  return httpProxy.createProxyServer({
    target: proxyUrl,
    ws: true
  });
}

function createProxyServer (router, certificates, { httpPort, httpsPort }) {
  if (Object.keys(certificates) === 0) {
    throw new Error('Could not createProxySever as no secureContexts could be generated');
  }

  const httpServer = http.createServer((request, response) => {
    response.writeHead(302, {
      Location: 'https://' + request.headers.host + request.url
    });
    response.end();
  }).listen(httpPort);
  console.log('Listening on port', httpPort);

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
        return key === serverName || matchWildcardDomain(key, serverName);
      });
      const matchingCertificate = certificates[matchingCertificateKey] || certificates[firstCertificateKey];

      return callback(null, matchingCertificate.secureContext);
    }
  }, httpsHandler).listen(httpsPort);

  server.on('upgrade', function (request, socket, head) {
    const proxy = createProxy(router, request);
    if (!proxy) {
      socket.destroy();
      return;
    }

    proxy.ws(request, socket, head);
  });

  console.log('Listening on port', httpsPort);

  return () => {
    httpServer.close();
    server.close();
  };
}

export default createProxyServer;
