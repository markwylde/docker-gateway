import http from 'http';
import https from 'https';
import test from 'basictap';
import axios from 'axios';
import WebSocket, { WebSocketServer } from 'ws';
import createDockerGateway from '../lib/index.js';

process.env.DOCKER_URL = 'http://0.0.0.0:9999';
process.env.CERT_PATTERN = './certs/**.pem';

const mockWSServer = new WebSocketServer({ noServer: true });
mockWSServer.on('connection', function connection (ws) {
  ws.on('error', console.error);
  ws.send('done');
});
const mockService = http.createServer((request, response) => {
  response.end('request.url=' + request.url);
});
mockService.on('upgrade', function upgrade (request, socket, head) {
  mockWSServer.handleUpgrade(request, socket, head, function done (ws) {
    mockWSServer.emit('connection', ws, request);
  });
});

mockService.listen(9998);

const mockDocker = http.createServer((request, response) => {
  if (request.url === '/v1.24/containers/json') {
    response.end(JSON.stringify([{
      Labels: {
        'docker-gateway.1': 'http://one.test/(.*) => https://one.test/$1',
        'docker-gateway.2': 'https://one.test/(.*) -> http://0.0.0.0:9998/$1',
        'docker-gateway.3': 'https://one.test/alpha/(.*) -> http://0.0.0.0:9998/pattern/a/$1',
        'docker-gateway.4': 'https://one.test/beta/(.*) -> http://0.0.0.0:9998/pattern/b/$1',
        'docker-gateway.5': 'http://two.test/(.*) => http://0.0.0.0:9998/$1',
        'docker-gateway.6': 'https://oops.test/(.*) -> http://notfound:9998/$1',
        'docker-gateway.7': 'https://(.*).four.test/(.*) -> http://0.0.0.0:9998/$1/$2',
        'docker-gateway.8': 'http://(.*).five.test/(.*) => http://$1:9998/$2'
      }
    }]));
    return;
  }

  response.end('[]');
});
mockDocker.listen(9999);

test('http - found', async t => {
  t.plan(2);

  const stop = await createDockerGateway({
    httpPort: 9080,
    httpsPort: 9443
  });

  const response = await axios('https://0.0.0.0:9443/test', {
    headers: {
      host: 'one.test'
    },
    httpsAgent: new https.Agent({
      rejectUnauthorized: false
    }),
    validateStatus: () => true
  });

  t.equal(response.status, 200, 'has correct status');
  t.equal(response.data, 'request.url=/test', 'has correct response text');

  stop();
});

test('http - wrong upstream host', async t => {
  t.plan(2);

  const stop = await createDockerGateway({
    httpPort: 9080,
    httpsPort: 9443
  });

  const response = await axios('https://0.0.0.0:9443/test', {
    headers: {
      host: 'oops.test'
    },
    httpsAgent: new https.Agent({
      rejectUnauthorized: false
    }),
    validateStatus: () => true
  });

  t.equal(response.status, 502, 'has correct status');
  t.equal(response.data, '502 - Bad Gateway', 'has correct response text');

  stop();
});

test('http - pattern matching', async t => {
  t.plan(2);

  const stop = await createDockerGateway({
    httpPort: 9080,
    httpsPort: 9443
  });

  const response = await axios('https://0.0.0.0:9443/alpha/one', {
    headers: {
      host: 'one.test'
    },
    httpsAgent: new https.Agent({
      rejectUnauthorized: false
    })
  });

  t.equal(response.status, 200, 'has correct status');
  t.equal(response.data, 'request.url=/pattern/a/one', 'has correct response text');

  stop();
});

test('http - multple pattern matching', async t => {
  t.plan(2);

  const stop = await createDockerGateway({
    httpPort: 9080,
    httpsPort: 9443
  });

  const response = await axios('https://0.0.0.0:9443/second', {
    headers: {
      host: 'first.four.test'
    },
    httpsAgent: new https.Agent({
      rejectUnauthorized: false
    })
  });

  t.equal(response.status, 200, 'has correct status');
  t.equal(response.data, 'request.url=/first/second', 'has correct response text');

  stop();
});

test('http - pattern matching domain', async t => {
  t.plan(2);

  const stop = await createDockerGateway({
    httpPort: 9080,
    httpsPort: 9443
  });

  const response = await axios('http://0.0.0.0:9080/second', {
    headers: {
      host: 'localhost.five.test'
    },
    validateStatus: () => true,
    maxRedirects: 0,
    httpsAgent: new https.Agent({
      rejectUnauthorized: false
    })
  });

  t.equal(response.status, 301, 'has correct status');
  t.equal(response.headers.location, 'http://localhost:9998/second', 'has correct location header');

  stop();
});

test('http - pattern matching with 301 redirect', async t => {
  t.plan(2);

  const stop = await createDockerGateway({
    httpPort: 9080,
    httpsPort: 9443
  });

  const response = await axios('http://0.0.0.0:9080/one', {
    headers: {
      host: 'one.test'
    },
    validateStatus: () => true,
    maxRedirects: 0
  });

  t.equal(response.status, 301, 'has correct status');
  t.equal(response.headers.location, 'https://one.test/one', 'has correct location header');

  stop();
});

test('http - domain not found', async t => {
  t.plan(2);

  const stop = await createDockerGateway({
    httpPort: 9080,
    httpsPort: 9443
  });

  const response = await axios('https://0.0.0.0:9443/test', {
    headers: {
      host: 'notfound.test'
    },
    validateStatus: () => true,
    httpsAgent: new https.Agent({
      rejectUnauthorized: false
    })
  });

  t.equal(response.status, 404, 'has correct status');
  t.equal(response.data, '404 Not Found - No route available to take this request', 'has correct response text');

  stop();
});

test('http - domain not found with 301 redirect', async t => {
  t.plan(2);

  const stop = await createDockerGateway({
    httpPort: 9080,
    httpsPort: 9443
  });

  const response = await axios('http://0.0.0.0:9080/one', {
    headers: {
      host: 'notfound.test'
    },
    validateStatus: () => true,
    maxRedirects: 0
  });

  t.equal(response.status, 404, 'has correct status');
  t.equal(response.data, '404 Not Found - No route available to take this request', 'has correct response text');

  stop();
});

test('websocket - found', async t => {
  t.plan(1);

  const stop = await createDockerGateway({
    httpPort: 9080,
    httpsPort: 9443
  });

  const ws = new WebSocket('wss://localhost:9443', {
    rejectUnauthorized: false,
    hostname: 'one.test',
    headers: {
      host: 'one.test'
    }
  });

  ws.on('open', function open () {
    ws.send('something');
  });

  ws.on('message', message => {
    ws.close();
    stop();
    t.equal(message.toString(), 'done');
  });
});

test('websocket - not found', async t => {
  t.plan(1);

  const stop = await createDockerGateway({
    httpPort: 9080,
    httpsPort: 9443
  });

  const ws = new WebSocket('wss://localhost:9443', {
    rejectUnauthorized: false,
    hostname: 'notfound.test',
    headers: {
      host: 'notfound.test'
    }
  });

  ws.on('error', error => {
    ws.close();
    stop();
    t.equal(error.message, 'socket hang up');
  });
});

test('websocket - proxy and 301 redirect', async t => {
  t.plan(1);

  const stop = await createDockerGateway({
    httpPort: 9080,
    httpsPort: 9443
  });

  const ws = new WebSocket('wss://localhost:9443/beta/one', {
    rejectUnauthorized: false,
    hostname: 'one.test',
    headers: {
      host: 'one.test'
    }
  });

  ws.on('open', function open () {
    ws.send('something');
  });

  ws.on('message', message => {
    ws.close();
    stop();
    t.equal(message.toString(), 'done');
  });
});

test('http - redirect to https', async t => {
  t.plan(2);

  const stop = await createDockerGateway({
    httpPort: 9080,
    httpsPort: 9443
  });

  const response = await axios('http://0.0.0.0:9080/alpha/one', {
    headers: {
      host: 'one.test'
    },
    validateStatus: () => true,
    maxRedirects: 0
  });

  t.equal(response.status, 301, 'has correct status');
  t.equal(response.headers.location, 'https://one.test/alpha/one', 'has correct location header');

  stop();
});

test('http - proxy http requests', async t => {
  t.plan(2);

  const stop = await createDockerGateway({
    httpPort: 9080,
    httpsPort: 9443
  });

  const response = await axios('http://0.0.0.0:9080/alpha/one', {
    headers: {
      host: 'two.test'
    },
    validateStatus: () => true
  });

  t.equal(response.status, 200, 'has correct status');
  t.equal(response.data, 'request.url=/alpha/one', 'has correct response text');

  stop();
});

test.on('finish', () => {
  setTimeout(() => {
    mockDocker.close();
    mockService.close();
    mockWSServer.close();
  });
});

test.trigger();
