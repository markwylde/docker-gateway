const http = require('http');

const server = http.createServer(function (request, response) {
  response.end('hello');
});

server.listen(80);

console.log('Listening on port 80');
