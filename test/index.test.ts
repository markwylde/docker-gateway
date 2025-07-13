import assert from "node:assert";
import http from "node:http";
import https from "node:https";
import test, { after, before, describe } from "node:test";
import axios from "axios";
import WebSocket, { WebSocketServer } from "ws";
import createDockerGateway from "../lib/index.ts";

process.env.DOCKER_URL = "http://0.0.0.0:9999";
process.env.CERT_PATTERN = "./certs/**.pem";

const mockWSServer = new WebSocketServer({ noServer: true });
mockWSServer.on("connection", function connection(ws: WebSocket) {
	ws.on("error", console.error);
	ws.send("done");
});

const mockService = http.createServer((request, response) => {
	response.end(`request.url=${request.url}`);
});

mockService.on("upgrade", function upgrade(request, socket, head) {
	mockWSServer.handleUpgrade(
		request,
		socket,
		head,
		function done(ws: WebSocket) {
			mockWSServer.emit("connection", ws, request);
		},
	);
});

let mockDocker: http.Server;
let mockServiceServer: http.Server;

before(() => {
	mockServiceServer = mockService.listen(9998);

	mockDocker = http.createServer((request, response) => {
		if (request.url === "/v1.24/containers/json") {
			response.end(
				JSON.stringify([
					{
						Labels: {
							"docker-gateway.1": "http://one.test/(.*) => https://one.test/$1",
							"docker-gateway.2":
								"https://one.test/(.*) -> http://0.0.0.0:9998/$1",
							"docker-gateway.3":
								"https://one.test/alpha/(.*) -> http://0.0.0.0:9998/pattern/a/$1",
							"docker-gateway.4":
								"https://one.test/beta/(.*) -> http://0.0.0.0:9998/pattern/b/$1",
							"docker-gateway.5":
								"http://two.test/(.*) => http://0.0.0.0:9998/$1",
							"docker-gateway.6":
								"https://oops.test/(.*) -> http://notfound:9998/$1",
							"docker-gateway.7":
								"https://(.*).four.test/(.*) -> http://0.0.0.0:9998/$1/$2",
							"docker-gateway.8":
								"http://(.*).five.test/(.*) => http://$1:9998/$2",
							"docker-gateway.9":
								"127.0.0.1 -> http://ipfiltered.test/(.*) -> http://0.0.0.0:9998/ipfiltered/$1",
							"docker-gateway.10":
								"127.0.0.1 -> https://ipfiltered.test/(.*) -> http://0.0.0.0:9998/ipfiltered/$1",
							"docker-gateway.11":
								"127.0.0.2 -> http://ipfiltered.test/(.*) -> http://0.0.0.0:9998/differentip/$1",
							"docker-gateway.12":
								"10.0.0.1 -> http://ipfiltered-strict.test/(.*) -> http://0.0.0.0:9998/strict/$1",
						},
					},
				]),
			);
			return;
		}

		response.end("[]");
	});
	mockDocker.listen(9999);
});

after(() => {
	mockDocker.close();
	mockServiceServer.close();
	mockWSServer.close();
});

describe("Docker Gateway Tests", () => {
	test("http - found", async () => {
		const stop = await createDockerGateway({
			httpPort: 9080,
			httpsPort: 9443,
			uiPort: 0,
		});

		const response = await axios("https://0.0.0.0:9443/test", {
			headers: {
				host: "one.test",
			},
			httpsAgent: new https.Agent({
				rejectUnauthorized: false,
			}),
			validateStatus: () => true,
		});

		assert.strictEqual(response.status, 200, "has correct status");
		assert.strictEqual(
			response.data,
			"request.url=/test",
			"has correct response text",
		);

		stop();
	});

	test("http - wrong upstream host", async () => {
		const stop = await createDockerGateway({
			httpPort: 9080,
			httpsPort: 9443,
			uiPort: 0,
		});

		const response = await axios("https://0.0.0.0:9443/test", {
			headers: {
				host: "oops.test",
			},
			httpsAgent: new https.Agent({
				rejectUnauthorized: false,
			}),
			validateStatus: () => true,
		});

		assert.strictEqual(response.status, 502, "has correct status");
		assert.strictEqual(
			response.data,
			"502 - Bad Gateway",
			"has correct response text",
		);

		stop();
	});

	test("http - pattern matching", async () => {
		const stop = await createDockerGateway({
			httpPort: 9080,
			httpsPort: 9443,
			uiPort: 0,
		});

		const response = await axios("https://0.0.0.0:9443/alpha/one", {
			headers: {
				host: "one.test",
			},
			httpsAgent: new https.Agent({
				rejectUnauthorized: false,
			}),
		});

		assert.strictEqual(response.status, 200, "has correct status");
		assert.strictEqual(
			response.data,
			"request.url=/pattern/a/one",
			"has correct response text",
		);

		stop();
	});

	test("http - multiple pattern matching", async () => {
		const stop = await createDockerGateway({
			httpPort: 9080,
			httpsPort: 9443,
			uiPort: 0,
		});

		const response = await axios("https://0.0.0.0:9443/second", {
			headers: {
				host: "first.four.test",
			},
			httpsAgent: new https.Agent({
				rejectUnauthorized: false,
			}),
		});

		assert.strictEqual(response.status, 200, "has correct status");
		assert.strictEqual(
			response.data,
			"request.url=/first/second",
			"has correct response text",
		);

		stop();
	});

	test("http - pattern matching domain", async () => {
		const stop = await createDockerGateway({
			httpPort: 9080,
			httpsPort: 9443,
			uiPort: 0,
		});

		const response = await axios("http://0.0.0.0:9080/second", {
			headers: {
				host: "localhost.five.test",
			},
			validateStatus: () => true,
			maxRedirects: 0,
			httpsAgent: new https.Agent({
				rejectUnauthorized: false,
			}),
		});

		assert.strictEqual(response.status, 301, "has correct status");
		assert.strictEqual(
			response.headers.location,
			"http://localhost:9998/second",
			"has correct location header",
		);

		stop();
	});

	test("http - pattern matching with 301 redirect", async () => {
		const stop = await createDockerGateway({
			httpPort: 9080,
			httpsPort: 9443,
			uiPort: 0,
		});

		const response = await axios("http://0.0.0.0:9080/one", {
			headers: {
				host: "one.test",
			},
			validateStatus: () => true,
			maxRedirects: 0,
		});

		assert.strictEqual(response.status, 301, "has correct status");
		assert.strictEqual(
			response.headers.location,
			"https://one.test/one",
			"has correct location header",
		);

		stop();
	});

	test("http - domain not found", async () => {
		const stop = await createDockerGateway({
			httpPort: 9080,
			httpsPort: 9443,
			uiPort: 0,
		});

		const response = await axios("https://0.0.0.0:9443/test", {
			headers: {
				host: "notfound.test",
			},
			validateStatus: () => true,
			httpsAgent: new https.Agent({
				rejectUnauthorized: false,
			}),
		});

		assert.strictEqual(response.status, 404, "has correct status");
		assert.strictEqual(
			response.data,
			"404 Not Found - No route available to take this request",
			"has correct response text",
		);

		stop();
	});

	test("http - domain not found with 301 redirect", async () => {
		const stop = await createDockerGateway({
			httpPort: 9080,
			httpsPort: 9443,
			uiPort: 0,
		});

		const response = await axios("http://0.0.0.0:9080/one", {
			headers: {
				host: "notfound.test",
			},
			validateStatus: () => true,
			maxRedirects: 0,
		});

		assert.strictEqual(response.status, 404, "has correct status");
		assert.strictEqual(
			response.data,
			"404 Not Found - No route available to take this request",
			"has correct response text",
		);

		stop();
	});

	test("websocket - found", async () => {
		const stop = await createDockerGateway({
			httpPort: 9080,
			httpsPort: 9443,
			uiPort: 0,
		});

		const ws = new WebSocket("wss://localhost:9443", {
			rejectUnauthorized: false,
			hostname: "one.test",
			headers: {
				host: "one.test",
			},
		});

		ws.on("open", function open() {
			ws.send("something");
		});

		ws.on("message", (message: Buffer) => {
			ws.close();
			stop();
			assert.strictEqual(message.toString(), "done");
		});
	});

	test("websocket - not found", async () => {
		const stop = await createDockerGateway({
			httpPort: 9080,
			httpsPort: 9443,
			uiPort: 0,
		});

		const ws = new WebSocket("wss://localhost:9443", {
			rejectUnauthorized: false,
			hostname: "notfound.test",
			headers: {
				host: "notfound.test",
			},
		});

		ws.on("error", (error: Error) => {
			ws.close();
			stop();
			assert.strictEqual(error.message, "socket hang up");
		});
	});

	test("websocket - proxy and 301 redirect", async () => {
		const stop = await createDockerGateway({
			httpPort: 9080,
			httpsPort: 9443,
			uiPort: 0,
		});

		const ws = new WebSocket("wss://localhost:9443/beta/one", {
			rejectUnauthorized: false,
			hostname: "one.test",
			headers: {
				host: "one.test",
			},
		});

		ws.on("open", function open() {
			ws.send("something");
		});

		ws.on("message", (message: Buffer) => {
			ws.close();
			stop();
			assert.strictEqual(message.toString(), "done");
		});
	});

	test("http - redirect to https", async () => {
		const stop = await createDockerGateway({
			httpPort: 9080,
			httpsPort: 9443,
			uiPort: 0,
		});

		const response = await axios("http://0.0.0.0:9080/alpha/one", {
			headers: {
				host: "one.test",
			},
			validateStatus: () => true,
			maxRedirects: 0,
		});

		assert.strictEqual(response.status, 301, "has correct status");
		assert.strictEqual(
			response.headers.location,
			"https://one.test/alpha/one",
			"has correct location header",
		);

		stop();
	});

	test("http - proxy http requests", async () => {
		const stop = await createDockerGateway({
			httpPort: 9080,
			httpsPort: 9443,
			uiPort: 0,
		});

		const response = await axios("http://0.0.0.0:9080/alpha/one", {
			headers: {
				host: "two.test",
			},
			validateStatus: () => true,
		});

		assert.strictEqual(response.status, 200, "has correct status");
		assert.strictEqual(
			response.data,
			"request.url=/alpha/one",
			"has correct response text",
		);

		stop();
	});

	test("http - IP filtering allows matching IP", async () => {
		const stop = await createDockerGateway({
			httpPort: 9080,
			httpsPort: 9443,
			uiPort: 0,
		});

		const response = await axios("http://127.0.0.1:9080/test", {
			headers: {
				host: "ipfiltered.test",
			},
			validateStatus: () => true,
		});

		assert.strictEqual(response.status, 200, "has correct status");
		assert.strictEqual(
			response.data,
			"request.url=/ipfiltered/test",
			"has correct response text",
		);

		stop();
	});

	test("https - IP filtering allows matching IP", async () => {
		const stop = await createDockerGateway({
			httpPort: 9080,
			httpsPort: 9443,
			uiPort: 0,
		});

		const response = await axios("https://127.0.0.1:9443/test", {
			headers: {
				host: "ipfiltered.test",
			},
			httpsAgent: new https.Agent({
				rejectUnauthorized: false,
			}),
			validateStatus: () => true,
		});

		assert.strictEqual(response.status, 200, "has correct status");
		assert.strictEqual(
			response.data,
			"request.url=/ipfiltered/test",
			"has correct response text",
		);

		stop();
	});

	test("http - IP filtering blocks non-matching IP", async () => {
		const stop = await createDockerGateway({
			httpPort: 9080,
			httpsPort: 9443,
			uiPort: 0,
		});

		// Wait a bit for the server to be ready
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Test with ipfiltered-strict.test which is bound to 10.0.0.1
		// When we connect via 127.0.0.1, it should not match
		const response = await axios("http://127.0.0.1:9080/test", {
			headers: {
				host: "ipfiltered-strict.test",
			},
			validateStatus: () => true,
		});

		assert.strictEqual(response.status, 404, "has correct status");
		assert.strictEqual(
			response.data,
			"404 Not Found - No route available to take this request",
			"has correct response text",
		);

		stop();
	});

	test("http - routes without IP filter work on any IP", async () => {
		const stop = await createDockerGateway({
			httpPort: 9080,
			httpsPort: 9443,
			uiPort: 0,
		});

		// Test that regular routes still work on any IP
		const response1 = await axios("http://127.0.0.1:9080/test", {
			headers: {
				host: "two.test",
			},
			validateStatus: () => true,
		});

		assert.strictEqual(
			response1.status,
			200,
			"has correct status for 127.0.0.1",
		);
		assert.strictEqual(
			response1.data,
			"request.url=/test",
			"has correct response text",
		);

		const response2 = await axios("http://0.0.0.0:9080/test", {
			headers: {
				host: "two.test",
			},
			validateStatus: () => true,
		});

		assert.strictEqual(response2.status, 200, "has correct status for 0.0.0.0");
		assert.strictEqual(
			response2.data,
			"request.url=/test",
			"has correct response text",
		);

		stop();
	});
});
