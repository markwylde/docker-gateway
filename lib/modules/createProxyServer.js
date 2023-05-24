import https from 'https';
import http from 'http';
import httpProxy from 'http-proxy';
import matchWildcardDomain from '../utils/matchWildcardDomain.js';

function findRoute (router, requestUrl) {
  const routes = router.getRoutes();
  let match;
  let type;

  const route = routes.find(route => {
    match = requestUrl.match(route.incomingHost);
    type = route.type;
    return match;
  });

  return {
    route,
    match,
    type
  };
}

function createProxy (router, request, response) {
  const protocol = request.connection.encrypted ? 'https' : 'http';
  const url = `${protocol}://${request.headers.host}${request.url || ''}`;

  const { route, match } = findRoute(router, url);

  if (!route) {
    if (response) {
      response.writeHead(404);
      response.end('404 Not Found - No route available to take this request');
    }
    return;
  }

  const proxyUrl = new URL(
    route.target.href.replace(/\$(\d+)/g, (_, index) => match[parseInt(index, 10)] || '')
  );

  request.url = proxyUrl.pathname + proxyUrl.search;

  return httpProxy.createProxyServer({
    target: proxyUrl,
    ws: true
  });
}

function handleHttp (router, request, response) {
  const url = `http://${request.headers.host}${request.url || ''}`;
  const { route, match, type } = findRoute(router, url);

  if (!route) {
    response.writeHead(404);
    response.end('404 Not Found - No route available to take this request');
    return;
  }

  if (type === 'redirect') {
    response.writeHead(301, {
      Location: route.target.href.replace(/\$(\d+)\b/g, (_, b) => match[b])
    });
    response.end();
  } else {
    const proxy = createProxy(router, request, response);
    if (!proxy) {
      return;
    }
    proxy.web(request, response);
    proxy.on('error', () => {
      response.writeHead(502);
      response.end('502 - Bad Gateway');
    });
  }
}

function handleHttps (router, request, response) {
  const proxy = createProxy(router, request, response);
  if (!proxy) {
    return;
  }
  proxy.web(request, response);
  proxy.on('error', () => {
    response.writeHead(502);
    response.end('502 - Bad Gateway');
  });
}

function createProxyServer (router, certificates, { httpPort, httpsPort }) {
  const httpServer = http.createServer((request, response) => {
    handleHttp(router, request, response);
  }).listen(httpPort);
  console.log('Listening on port', httpPort);

  const httpsServer = https.createServer(
    {
      SNICallback: (serverName, callback) => {
        const firstCertificateKey = Object.keys(certificates)[0];

        const matchingCertificateKey = Object.keys(certificates).find((key) => {
          return key === serverName || matchWildcardDomain(key, serverName);
        });
        const matchingCertificate = certificates[matchingCertificateKey] || certificates[firstCertificateKey];

        return callback(null, matchingCertificate.secureContext);
      }
    },
    (request, response) => {
      handleHttps(router, request, response);
    }
  ).listen(httpsPort);

  httpsServer.on('upgrade', function (request, socket, head) {
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
    httpsServer.close();
  };
}

export default createProxyServer;
