import { readFile } from "node:fs/promises";
import http, { type Server } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Eta } from "eta";
import type { UiServer as IUiServer, Route } from "../types.ts";
import { createLogger } from "../utils/logger.ts";

const logger = createLogger("UiServer");

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Change {
	timestamp: string;
	event: string;
}

class UiServer implements IUiServer {
	private changes: Change[] = [];
	private routes: Route[] = [];
	private eta: Eta;

	constructor() {
		this.changes = [];
		this.routes = [];
		this.eta = new Eta({
			views: join(__dirname),
		});
	}

	logEvent(event: string): void {
		this.logChange(event);
	}

	logChange(event: string): void {
		this.changes.unshift({
			timestamp: new Date().toLocaleString(),
			event,
		});

		// Keep only last 100 changes
		if (this.changes.length > 100) {
			this.changes.pop();
		}
	}

	updateRoutes(routes: Route[]): void {
		const oldRoutes = JSON.stringify(this.routes);
		const oldRoutesArray = [...this.routes];
		this.routes = routes;

		if (oldRoutes !== JSON.stringify(routes)) {
			// Find new routes that weren't in the old routes
			const newRoutes = routes.filter(
				(route) =>
					!oldRoutesArray.some(
						(oldRoute) =>
							oldRoute.configValue === route.configValue &&
							oldRoute.serviceId === route.serviceId,
					),
			);

			// Find removed routes that were in the old routes but not in the new routes
			const removedRoutes = oldRoutesArray.filter(
				(oldRoute) =>
					!routes.some(
						(route) =>
							route.configValue === oldRoute.configValue &&
							route.serviceId === oldRoute.serviceId,
					),
			);

			// Log specific changes
			if (newRoutes.length > 0) {
				newRoutes.forEach((route) => {
					const destination = route.type === "proxy" ? "->" : "=>";
					this.logChange(
						`Service ${route.serviceName} added route ${route.incomingHost} ${destination} ${route.target.href}`,
					);
				});
			}

			if (removedRoutes.length > 0) {
				removedRoutes.forEach((route) => {
					const destination = route.type === "proxy" ? "->" : "=>";
					this.logChange(
						`Service ${route.serviceName} removed route ${route.incomingHost} ${destination} ${route.target.href}`,
					);
				});
			}

			// If no specific changes were logged (e.g., only properties changed), log a generic update
			if (newRoutes.length === 0 && removedRoutes.length === 0) {
				this.logChange("Routes updated");
			}
		}
	}

	async start(port: number | string = 8080): Promise<Server> {
		// If port is 0, disable UI server (useful for tests)
		if (port === 0 || port === "0") {
			return {
				close: () => {},
			} as unknown as Server;
		}

		const templateContent = await readFile(
			join(__dirname, "template.eta"),
			"utf8",
		);

		const server = http.createServer(async (req, res) => {
			if (req.url === "/") {
				const html = await this.eta.renderString(templateContent, {
					routes: this.routes,
					changes: this.changes,
				});

				res.writeHead(200, { "Content-Type": "text/html" });
				res.end(html);
				return;
			}

			res.writeHead(404);
			res.end("Not found");
		});

		server.listen(Number(port), () => {
			logger.info(`UI server listening on port ${port}`);
		});

		return server;
	}
}

export default UiServer;
