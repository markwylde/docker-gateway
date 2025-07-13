import http, { type IncomingMessage, type ServerResponse } from "node:http";
import https from "node:https";
import type { Socket } from "node:net";
import type { SecureContext } from "node:tls";
import httpProxy from "http-proxy";
import type { Certificate, Route, Router } from "../types.ts";
import matchWildcardDomain from "../utils/matchWildcardDomain.ts";

interface FindRouteResult {
	route: Route | undefined;
	match: RegExpMatchArray | null;
	type: "proxy" | "redirect" | undefined;
}

function findRoute(
	router: Router,
	requestUrl: string,
	localAddress: string | undefined,
): FindRouteResult {
	const routes = router.getRoutes();
	let match: RegExpMatchArray | null = null;
	let type: "proxy" | "redirect" | undefined;

	const route = routes.find((route) => {
		match = requestUrl.match(route.incomingHost);
		type = route.type;

		// If route has a bindIp, check if it matches the local address
		if (match && route.bindIp) {
			// Normalize addresses to handle various formats
			let normalizedLocalAddress = localAddress;

			// Handle IPv6 mapped IPv4 addresses (::ffff:127.0.0.1 -> 127.0.0.1)
			if (normalizedLocalAddress?.startsWith("::ffff:")) {
				normalizedLocalAddress = normalizedLocalAddress.substring(7);
			}

			// Debug logging for IP filtering
			if (requestUrl.includes("ipfiltered.test")) {
				console.log("DEBUG: IP filtering check", {
					routeBindIp: route.bindIp,
					localAddress,
					normalizedLocalAddress,
					routeTarget: route.target.href,
				});
			}

			// Handle IPv6 loopback (::1) as 127.0.0.1
			if (normalizedLocalAddress === "::1" && route.bindIp === "127.0.0.1") {
				return true;
			}

			// Handle IPv4 loopback variations
			if (
				(normalizedLocalAddress === "127.0.0.1" ||
					normalizedLocalAddress === "::1") &&
				(route.bindIp === "127.0.0.1" || route.bindIp === "::1")
			) {
				return true;
			}

			// When connecting to 0.0.0.0, the localAddress might be the actual interface IP
			// In this case, we need to check strictly - no special handling
			if (normalizedLocalAddress !== route.bindIp) {
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
	const localAddress = request.socket.localAddress;

	const { route, match } = findRoute(router, url, localAddress);

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
	const localAddress = request.socket.localAddress;

	// Debug logging
	if (request.headers.host === "ipfiltered.test") {
		console.log("DEBUG: IP filtering request", {
			url,
			localAddress,
			remoteAddress: request.socket.remoteAddress,
			headers: request.headers,
		});
	}

	const { route, match, type } = findRoute(router, url, localAddress);

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
		.listen(httpPort);
	console.log("Listening on port", httpPort);

	const httpsServer = https
		.createServer(
			{
				SNICallback: (
					serverName: string,
					callback: (err: Error | null, ctx?: SecureContext) => void,
				) => {
					const firstCertificateKey = Object.keys(certificates)[0];

					const matchingCertificateKey = Object.keys(certificates).find(
						(key) => {
							return key === serverName || matchWildcardDomain(key, serverName);
						},
					);
					const matchingCertificate = matchingCertificateKey
						? certificates[matchingCertificateKey]
						: certificates[firstCertificateKey];

					return callback(null, matchingCertificate.secureContext);
				},
			},
			(request, response) => {
				handleHttps(router, request, response);
			},
		)
		.listen(httpsPort);

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

	console.log("Listening on port", httpsPort);

	return () => {
		httpServer.close();
		httpsServer.close();
	};
}

export default createProxyServer;
