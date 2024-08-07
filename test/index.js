import http from 'http';
import https from 'https';
import axios from 'axios';
import WebSocket, { WebSocketServer } from 'ws';
import createDockerGateway from '../lib/index.js';
import test, { describe, it, before, after } from 'node:test';
import assert from 'assert';

process.env.DOCKER_URL = 'http://0.0.0.0:9999';
process.env.CERT_PATTERN = './certs/**.pem';

const mockWSServer = new WebSocketServer({ noServer: true });
mockWSServer.on('connection', function connection(ws) {
  ws.on('error', console.error);
  ws.send('done');
});

const mockService = http.createServer((request, response) => {
  response.end('request.url=' + request.url);
});

mockService.on('upgrade', function upgrade(request, socket, head) {
  mockWSServer.handleUpgrade(request, socket, head, function done(ws) {
    mockWSServer.emit('connection', ws, request);
  });
});

let mockDocker;
let mockServiceServer;

before(() => {
  mockServiceServer = mockService.listen(9998);

  mockDocker = http.createServer((request, response) => {
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
});

after(() => {
  mockDocker.close();
  mockServiceServer.close();
  mockWSServer.close();
});

describe('Docker Gateway Tests', () => {
  test('http - found', async () => {
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

    assert.strictEqual(response.status, 200, 'has correct status');
    assert.strictEqual(response.data, 'request.url=/test', 'has correct response text');

    stop();
  });

  test('http - wrong upstream host', async () => {
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

    assert.strictEqual(response.status, 502, 'has correct status');
    assert.strictEqual(response.data, '502 - Bad Gateway', 'has correct response text');

    stop();
  });

  test('http - pattern matching', async () => {
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

    assert.strictEqual(response.status, 200, 'has correct status');
    assert.strictEqual(response.data, 'request.url=/pattern/a/one', 'has correct response text');

    stop();
  });

  test('http - multiple pattern matching', async () => {
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

    assert.strictEqual(response.status, 200, 'has correct status');
    assert.strictEqual(response.data, 'request.url=/first/second', 'has correct response text');

    stop();
  });

  test('http - pattern matching domain', async () => {
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

    assert.strictEqual(response.status, 301, 'has correct status');
    assert.strictEqual(response.headers.location, 'http://localhost:9998/second', 'has correct location header');

    stop();
  });

  test('http - pattern matching with 301 redirect', async () => {
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

    assert.strictEqual(response.status, 301, 'has correct status');
    assert.strictEqual(response.headers.location, 'https://one.test/one', 'has correct location header');

    stop();
  });

  test('http - domain not found', async () => {
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

    assert.strictEqual(response.status, 404, 'has correct status');
    assert.strictEqual(response.data, '404 Not Found - No route available to take this request', 'has correct response text');

    stop();
  });

  test('http - domain not found with 301 redirect', async () => {
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

    assert.strictEqual(response.status, 404, 'has correct status');
    assert.strictEqual(response.data, '404 Not Found - No route available to take this request', 'has correct response text');

    stop();
  });

  test('websocket - found', async () => {
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
      assert.strictEqual(message.toString(), 'done');
    });
  });

  test('websocket - not found', async () => {
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
      assert.strictEqual(error.message, 'socket hang up');
    });
  });

  test('websocket - proxy and 301 redirect', async () => {
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
      assert.strictEqual(message.toString(), 'done');
    });
  });

  test('http - redirect to https', async () => {
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

    assert.strictEqual(response.status, 301, 'has correct status');
    assert.strictEqual(response.headers.location, 'https://one.test/alpha/one', 'has correct location header');

    stop();
  });

  test('http - proxy http requests', async () => {
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

    assert.strictEqual(response.status, 200, 'has correct status');
    assert.strictEqual(response.data, 'request.url=/alpha/one', 'has correct response text');

    stop();
  });
});
