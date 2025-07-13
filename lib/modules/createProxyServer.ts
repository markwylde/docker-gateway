import http, { type IncomingMessage, type ServerResponse } from "node:http";
import https from "node:https";
import type { Socket } from "node:net";
import type { SecureContext } from "node:tls";
import httpProxy from "http-proxy";
import type { Certificate, Route, Router } from "../types.ts";
import { isClientIpAllowed } from "../utils/ipUtils.ts";
import matchWildcardDomain from "../utils/matchWildcardDomain.ts";

interface FindRouteResult {
	route: Route | undefined;
	match: RegExpMatchArray | null;
	type: "proxy" | "redirect" | undefined;
}

function findRoute(
	router: Router,
	requestUrl: string,
	clientIp: string | undefined,
): FindRouteResult {
	const routes = router.getRoutes();
	let match: RegExpMatchArray | null = null;
	let type: "proxy" | "redirect" | undefined;

	const route = routes.find((route) => {
		match = requestUrl.match(route.incomingHost);
		type = route.type;

		// Check client IP range if specified
		if (match && route.clientIpRange) {
			if (!isClientIpAllowed(clientIp, route.clientIpRange)) {
				console.log("DEBUG: Client IP rejected", {
					clientIp,
					allowedRange: route.clientIpRange,
					route: route.configValue,
				});
				return false;
			}
		}

		return match;
	});

	return {
		route,
		match,
		type,
	};
}

function createProxy(
	router: Router,
	request: IncomingMessage & { url?: string },
	response?: ServerResponse,
): httpProxy | undefined {
	const protocol =
		"encrypted" in request.socket && request.socket.encrypted
			? "https"
			: "http";
	const url = `${protocol}://${request.headers.host}${request.url || ""}`;

	// Use only the remote socket address for client IP
	const clientIp = request.socket.remoteAddress;

	console.log("DEBUG: Client IP detection in createProxy", {
		socketRemoteAddress: request.socket.remoteAddress,
		socketRemoteFamily: request.socket.remoteFamily,
		socketRemotePort: request.socket.remotePort,
		socketLocalAddress: request.socket.localAddress,
		socketLocalPort: request.socket.localPort,
		headers: request.headers,
		resolvedClientIp: clientIp,
	});

	const { route, match } = findRoute(router, url, clientIp);

	if (!route) {
		if (response) {
			response.writeHead(404);
			response.end("404 Not Found - No route available to take this request");
		}
		return;
	}

	const proxyUrl = new URL(
		route.target.href.replace(
			/\$(\d+)/g,
			(_, index) => match?.[parseInt(index, 10)] || "",
		),
	);

	console.log("DEBUG: Route matched", {
		requestHost: request.headers.host,
		requestUrl: url,
		matchedRoute: route.configValue,
		upstreamTarget: proxyUrl.href,
		routePattern: route.incomingHost,
		serviceName: route.serviceName,
	});

	request.url = proxyUrl.pathname + proxyUrl.search;

	return httpProxy.createProxyServer({
		target: proxyUrl,
		ws: true,
		xfwd: true,
	});
}

function handleHttp(
	router: Router,
	request: IncomingMessage,
	response: ServerResponse,
): void {
	const url = `http://${request.headers.host}${request.url || ""}`;
	const remoteAddress = request.socket.remoteAddress;

	// Use only the remote socket address for client IP
	const clientIp = remoteAddress;

	// Debug logging for all requests
	console.log("DEBUG: handleHttp request", {
		host: request.headers.host,
		remoteAddress,
		clientIp,
		url,
		method: request.method,
	});

	// Additional debug logging for IP filtering
	if (request.headers.host === "ipfiltered.test") {
		console.log("DEBUG: IP filtering request", {
			url,
			remoteAddress: request.socket.remoteAddress,
			clientIp,
			headers: request.headers,
		});
	}

	const { route, match, type } = findRoute(router, url, clientIp);

	if (!route) {
		response.writeHead(404);
		response.end("404 Not Found - No route available to take this request");
		return;
	}

	if (type === "redirect") {
		response.writeHead(301, {
			Location: route.target.href.replace(
				/\$(\d+)\b/g,
				(_, b) => match?.[b] || "",
			),
		});
		response.end();
	} else {
		const proxy = createProxy(router, request, response);
		if (!proxy) {
			return;
		}
		proxy.web(request, response);
		proxy.on("error", () => {
			response.writeHead(502);
			response.end("502 - Bad Gateway");
		});
	}
}

function handleHttps(
	router: Router,
	request: IncomingMessage,
	response: ServerResponse,
): void {
	const proxy = createProxy(router, request, response);
	if (!proxy) {
		return;
	}
	proxy.web(request, response);
	proxy.on("error", () => {
		response.writeHead(502);
		response.end("502 - Bad Gateway");
	});
}

function createProxyServer(
	router: Router,
	certificates: Record<string, Certificate>,
	{ httpPort, httpsPort }: { httpPort: number; httpsPort: number },
): () => void {
	const httpServer = http
		.createServer((request, response) => {
			handleHttp(router, request, response);
		})
		.listen(httpPort, "0.0.0.0", () => {
			const addr = httpServer.address();
			console.log("HTTP Server listening on", addr);
		});

	const httpsServer = https
		.createServer(
			{
				SNICallback: (
					serverName: string,
					callback: (err: Error | null, ctx?: SecureContext) => void,
				) => {
					const certificateKeys = Object.keys(certificates);

					// If no certificates available, return without context
					if (certificateKeys.length === 0) {
						return callback(null);
					}

					const firstCertificateKey = certificateKeys[0];

					const matchingCertificateKey = certificateKeys.find((key) => {
						return key === serverName || matchWildcardDomain(key, serverName);
					});
					const matchingCertificate = matchingCertificateKey
						? certificates[matchingCertificateKey]
						: certificates[firstCertificateKey];

					return callback(null, matchingCertificate?.secureContext);
				},
			},
			(request, response) => {
				handleHttps(router, request, response);
			},
		)
		.listen(httpsPort, "0.0.0.0", () => {
			const addr = httpsServer.address();
			console.log("HTTPS Server listening on", addr);
		});

	httpsServer.on(
		"upgrade",
		(request: IncomingMessage, socket: Socket, head: Buffer) => {
			const proxy = createProxy(router, request);
			if (!proxy) {
				socket.destroy();
				return;
			}
			proxy.ws(request, socket, head);
		},
	);

	return () => {
		httpServer.close();
		httpsServer.close();
	};
}

export default createProxyServer;
