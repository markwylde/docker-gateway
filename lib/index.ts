import path from "node:path";
import minimist from "minimist";
import createProxyServer from "./modules/createProxyServer.ts";
import listRoutesFromServices from "./modules/listRoutesFromServices.ts";
import watchDockerForChanges from "./modules/watchDockerForChanges.ts";
import UiServer from "./ui/server.ts";
import createRouter from "./utils/createRouter.ts";
import seekCertificates from "./utils/seekCertificates.ts";

interface DockerGatewayOptions {
	httpPort?: number | string;
	httpsPort?: number | string;
	uiPort?: number | string;
}

const defaultOptions: DockerGatewayOptions = {
	httpPort: process.env.HTTP_PORT || 80,
	httpsPort: process.env.HTTPS_PORT || 443,
	uiPort: process.env.UI_PORT || 8080,
};

export default async function createDockerGateway(
	passedOptions: DockerGatewayOptions = defaultOptions,
): Promise<() => void> {
	const options: Required<DockerGatewayOptions> = {
		...defaultOptions,
		...JSON.parse(JSON.stringify(passedOptions)),
	} as Required<DockerGatewayOptions>;

	const router = createRouter();
	const certificates = await seekCertificates();
	const uiServer = new UiServer();

	// Start UI server
	const uiHttpServer = await uiServer.start(options.uiPort);

	// Attach UI server to router for event logging
	router.uiServer = uiServer;

	// Hook into router to update UI
	const originalSetRoutes = router.setRoutes;
	router.setRoutes = (routes) => {
		originalSetRoutes.call(router, routes);
		uiServer.updateRoutes(routes);
	};

	// Initialize the stoppingContainers set
	const stoppingContainers = new Set<string>();

	// Initial route loading
	await listRoutesFromServices(router, stoppingContainers);

	// Start watching for Docker changes
	const stopWatching = await watchDockerForChanges(
		router,
		stoppingContainers,
		uiServer,
	);

	const stopServers = await createProxyServer(router, certificates, {
		httpPort: Number(options.httpPort),
		httpsPort: Number(options.httpsPort),
	});

	return () => {
		stopWatching();
		stopServers();
		uiHttpServer.close();
	};
}
const runningAsMain =
	import.meta.url.endsWith(path.basename(process.argv[1])) ||
	import.meta.url.endsWith(`${path.basename(process.argv[1])}/index.js`);

if (runningAsMain) {
	const argv = minimist(process.argv) as {
		"http-port"?: string;
		"https-port"?: string;
		"ui-port"?: string;
	};
	createDockerGateway({
		httpPort: argv["http-port"],
		httpsPort: argv["https-port"],
		uiPort: argv["ui-port"],
	});
}
