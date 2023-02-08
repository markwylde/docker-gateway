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
        'docker-gateway.1': 'https://one.test/(.*) -> http://0.0.0.0:9998/$1',
        'docker-gateway.2': 'https://one.test/alpha/(.*) -> http://0.0.0.0:9998/pattern/a/$1',
        'docker-gateway.3': 'https://one.test/beta/(.*) -> http://0.0.0.0:9998/pattern/b/$1'
      }
    }]));
    return;
  }

  response.end('[]');
});
mockDocker.listen(9999);

test('test http', async t => {
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
    })
  });

  console.log('rd=', response.data);

  t.equal(response.status, 200, 'has correct status');
  t.equal(response.data, 'request.url=/test', 'has correct response text');

  stop();
});

test('test pattern matching', async t => {
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

test('test websocket', async t => {
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

test.on('finish', () => {
  setTimeout(() => {
    mockDocker.close();
    mockService.close();
    mockWSServer.close();
  });
});

test.trigger();
