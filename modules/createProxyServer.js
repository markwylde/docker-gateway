const https = require('https');
const http = require('http');
const fs = require('fs');

const options = {
  key: fs.readFileSync(process.env.SSL_KEY_PATH),
  cert: fs.readFileSync(process.env.SSL_CERT_PATH),
  ca: fs.readFileSync(process.env.SSL_CHAIN_PATH)
};

function createProxyServer (routes) {
  http.createServer((request, response) => {
    response.writeHead(302, {
      'Location': 'https://' + request.headers.host + request.url
    });
    response.end();
  }).listen(80);
  console.log('Listening on port 80');

  https.createServer(options, onRequest).listen(443);
  console.log('Listening on port 443');

  function onRequest(client_req, client_res) {
    let route
    try {
      const url = `https://${client_req.headers.host}${client_req.url || ''}`
      route = routes.find(route => url.match(route.incomingUrl))
    } catch (error) {
      console.log(error)
    }
  
    if (!route) {
      client_res.writeHead(404)
      client_res.end('404 Not Found')
      return
    }
    hostname = route.serviceName

    var options = {
      hostname,
      port: 80,
      path: client_req.url,
      method: client_req.method,
      headers: client_req.headers,
      timeout: 5000
    };
  
    var proxy = http.request(options, function (res) {
      client_res.writeHead(res.statusCode, res.headers)
      res.pipe(client_res, {
        end: true
      });
    });
  
    proxy.on('error', function (error) {
      console.log(error)
      client_res.writeHead(500)
      client_res.end('500 Internal Server Error')
      return
    })

    proxy.on('timeout', function () {
      console.log('connection timeout')
      client_res.writeHead(504)
      client_res.end('504 Gateway Timeout')
      return
    })

    client_req.pipe(proxy, {
      end: true
    });
  }  
}

module.exports = createProxyServer
