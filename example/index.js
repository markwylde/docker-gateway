const http = require('http');

const server = http.createServer(function (request, response) {
  response.end('hello');
});

server.listen(8080);

console.log('Listening on port 8080');
