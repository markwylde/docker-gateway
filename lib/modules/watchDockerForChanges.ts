import http, { type IncomingMessage } from "node:http";
import ndJsonFe from "ndjson-fe";
import type { Router, UiServer } from "../types.ts";
import getDockerUrl from "../utils/getDockerUrl.ts";
import { createLogger } from "../utils/logger.ts";
import listRoutesFromServices from "./listRoutesFromServices.ts";

const logger = createLogger("watchDockerForChanges");

// Modified listRoutesFromServices function that filters out stopping containers
async function listRoutesFromServicesFiltered(
	router: Router,
	stoppingContainers: Set<string>,
): Promise<void> {
	// Call the original function but filter out stopping containers
	await listRoutesFromServices(router, stoppingContainers);
}

function watchDockerForChanges(
	router: Router,
	stoppingContainers: Set<string> = new Set(),
	uiServer?: UiServer,
): Promise<() => void> {
	return new Promise((resolve) => {
		const options = {
			...getDockerUrl(),
			// path: '/events?filters={%22event%22:[%22start%22,%22stop%22,%22kill%22]}',
			path: "/events",
		};

		const callback = (response: IncomingMessage) => {
			if (response.statusCode === 200) {
				logger.info("Watching docker for changes");
			}
			response.setEncoding("utf8");

			const feed = ndJsonFe();

			feed.on("next", (data) => parseDockerEvent(data as DockerEvent));
			feed.on("error", (data) => logger.error(data));
			feed.on("end", () => {
				logger.info("The stream has finished");
			});

			response.pipe(feed);

			resolve(() => {
				response.destroy();
			});
		};

		// Log all events for debugging
		interface DockerEvent {
			Type?: string;
			Action?: string;
			Actor?: {
				ID?: string;
				Attributes?: {
					name?: string;
					image?: string;
				};
			};
		}

		function parseDockerEvent(response: DockerEvent): void {
			logger.debug("Docker event received:", JSON.stringify(response, null, 2));

			if (response.Type === "container") {
				const action = response.Action;

				// Extract container ID and name from the event
				// The Actor.ID contains the full container ID
				const containerId = response.Actor?.ID;

				// The Actor.Attributes.name contains the container name
				const containerName = response.Actor?.Attributes?.name || "unknown";

				// The Actor.Attributes.image contains the image name
				const imageName = response.Actor?.Attributes?.image || "unknown";

				// Extract service name from Docker Compose container name (project_service_1)
				const serviceName = extractServiceName(containerName);

				console.log(
					`Docker event: ${response.Type} ${action} for ${containerName} (${containerId}), image: ${imageName}, service: ${serviceName}`,
				);
				uiServer?.logEvent(`Container ${containerName} ${action}`);

				// Define events that should trigger immediate route removal
				const stopEvents = [
					"die",
					"kill",
					"stop",
					"pause",
					"destroy",
					"remove",
				];

				// Immediately remove routes for containers that should not receive traffic
				if (action && stopEvents.includes(action)) {
					console.log(
						`Container ${containerName} (${containerId}) is ${action}, removing routes immediately`,
					);

					// Add this container to the stopping containers set
					if (containerId) {
						stoppingContainers.add(containerId);
						logger.debug(
							`Added ${containerId} to stopping containers set (size: ${stoppingContainers.size})`,
						);
					}
					if (containerName && containerName !== "unknown") {
						stoppingContainers.add(containerName);
						console.log(
							`Added ${containerName} to stopping containers set (size: ${stoppingContainers.size})`,
						);
					}
					if (serviceName && serviceName !== containerName) {
						stoppingContainers.add(serviceName);
						console.log(
							`Added ${serviceName} to stopping containers set (size: ${stoppingContainers.size})`,
						);
					}

					// Try to remove routes by container ID
					const removedById = containerId
						? removeContainerRoutes(containerId)
						: false;

					// Also try to remove routes by container name if ID removal didn't work
					if (!removedById && containerName && containerName !== "unknown") {
						console.log(
							`Also trying to remove routes by container name: ${containerName}`,
						);
						const removedByName = removeContainerRoutes(containerName);

						// Also try to remove routes by service name if name removal didn't work
						if (
							!removedByName &&
							serviceName &&
							serviceName !== containerName
						) {
							console.log(
								`Also trying to remove routes by service name: ${serviceName}`,
							);
							removeContainerRoutes(serviceName);
						}
					}

					// Always refresh all routes after removing specific ones
					// This ensures the router state is consistent, but filter out stopping containers
					listRoutesFromServicesFiltered(router, stoppingContainers);
				} else if (action && ["unpause", "start", "create"].includes(action)) {
					// When a container starts, unpauses, or is created, remove it from stopping containers
					if (containerId) {
						stoppingContainers.delete(containerId);
						console.log(
							`Removed ${containerId} from stopping containers set (size: ${stoppingContainers.size})`,
						);
					}
					if (containerName && containerName !== "unknown") {
						stoppingContainers.delete(containerName);
						console.log(
							`Removed ${containerName} from stopping containers set (size: ${stoppingContainers.size})`,
						);
					}
					if (serviceName && serviceName !== containerName) {
						stoppingContainers.delete(serviceName);
						console.log(
							`Removed ${serviceName} from stopping containers set (size: ${stoppingContainers.size})`,
						);
					}

					// Refresh all routes
					console.log(
						`Container ${containerName} (${containerId}) is ${action}, refreshing routes`,
					);
					listRoutesFromServicesFiltered(router, stoppingContainers);
				} else {
					// For other container events, still refresh all routes to keep everything in sync
					console.log(
						`Container ${containerName} (${containerId}) had event ${action}, refreshing routes`,
					);
					listRoutesFromServicesFiltered(router, stoppingContainers);
				}
			} else if (response.Type === "service") {
				// Handle service events (for Docker Swarm)
				const action = response.Action;
				const serviceId = response.Actor?.ID;
				const serviceName = response.Actor?.Attributes?.name || "unknown";

				console.log(
					`Docker service event: ${action} for ${serviceName} (${serviceId})`,
				);
				uiServer?.logEvent(`Service ${serviceName} ${action}`);

				// For service removal events, immediately remove routes
				if (action && ["remove", "delete"].includes(action)) {
					console.log(
						`Service ${serviceName} (${serviceId}) is ${action}, removing routes immediately`,
					);

					// Add to stopping containers set
					if (serviceId) {
						stoppingContainers.add(serviceId);
						console.log(
							`Added ${serviceId} to stopping containers set (size: ${stoppingContainers.size})`,
						);
					}
					if (serviceName && serviceName !== "unknown") {
						stoppingContainers.add(serviceName);
						console.log(
							`Added ${serviceName} to stopping containers set (size: ${stoppingContainers.size})`,
						);
					}

					if (serviceId) {
						removeContainerRoutes(serviceId);
					}
					if (serviceName && serviceName !== "unknown") {
						removeContainerRoutes(serviceName);
					}
				}

				// Always refresh routes for service events
				listRoutesFromServicesFiltered(router, stoppingContainers);
			} else {
				// For other event types, just refresh all routes
				logger.debug(`Docker event: ${response.Type} ${response.Action}`);
				listRoutesFromServicesFiltered(router, stoppingContainers);
			}
		}

		// Helper function to extract service name from Docker Compose container name
		// Docker Compose names follow the pattern: project_service_1
		function extractServiceName(
			containerName: string | undefined,
		): string | null {
			if (!containerName || containerName === "unknown") {
				return null;
			}

			// Check for Docker Compose naming pattern (project_service_1)
			const parts = containerName.split("_");
			if (parts.length >= 2) {
				// If the last part is a number, it's likely the container number
				const lastPart = parts[parts.length - 1];
				if (/^\d+$/.test(lastPart)) {
					// Return the middle part(s) which is likely the service name
					return parts.slice(1, -1).join("_");
				}
			}

			// For docker-gateway-example-one-1 pattern
			if (containerName.includes("-")) {
				const parts = containerName.split("-");
				// If the last part is a number, return everything before it
				const lastPart = parts[parts.length - 1];
				if (/^\d+$/.test(lastPart)) {
					return parts.slice(0, -1).join("-");
				}
			}

			return containerName;
		}

		function removeContainerRoutes(containerId: string | null): boolean {
			if (!containerId) {
				console.log("No container ID provided, cannot remove routes");
				return false;
			}

			// Get current routes
			const currentRoutes = router.getRoutes();
			console.log(
				`Checking ${currentRoutes.length} routes for container ID ${containerId}`,
			);

			// Extract container name from the event
			const containerName = containerId.split("/").pop();
			console.log(`Container name extracted: ${containerName}`);

			// Extract service name if this is a Docker Compose container
			const serviceName = containerName
				? extractServiceName(containerName)
				: null;
			if (serviceName) {
				console.log(`Service name extracted: ${serviceName}`);
			}

			// Filter out routes for the stopping container
			// We need to check both the full ID and the container name
			const updatedRoutes = currentRoutes.filter((route) => {
				if (!route.serviceId) {
					return true; // Keep routes without serviceId
				}

				// Check if the route's serviceId matches the containerId
				const idMatches = route.serviceId === containerId;

				// Check if the container name is part of the route's serviceId
				// This handles cases where the full path isn't matched
				const nameInServiceId =
					containerName && route.serviceId.includes(containerName);

				// Check if the service name is part of the route's serviceId
				// This handles docker-compose naming patterns
				const serviceNameMatches =
					serviceName && route.serviceId.includes(serviceName);

				// Also check if the route's serviceId contains the container name
				// This handles docker-compose naming patterns like project_service_1
				const serviceIdContainsName = containerName?.includes(route.serviceId);

				// If any match is found, we should remove this route
				const shouldRemove =
					idMatches ||
					nameInServiceId ||
					serviceIdContainsName ||
					serviceNameMatches;

				if (shouldRemove) {
					console.log(
						`Removing route: ${route.configValue} for service ${route.serviceId}`,
					);
					console.log(
						`Match reason: ID match: ${idMatches}, Name in ID: ${nameInServiceId}, ` +
							`ID contains name: ${serviceIdContainsName}, Service name match: ${serviceNameMatches}`,
					);
				}

				// Return true to keep routes that don't match (filter keeps when true)
				return !shouldRemove;
			});

			// If routes were removed, update the router
			if (updatedRoutes.length !== currentRoutes.length) {
				console.log(
					`Removed ${currentRoutes.length - updatedRoutes.length} routes for container ${containerId}`,
				);
				router.setRoutes(updatedRoutes);
				return true; // Routes were removed
			} else {
				console.log(`No routes found for container ${containerId}`);

				// If no routes were found by ID, try to find by name pattern
				// This is a fallback for when the container ID doesn't match directly
				const containerNameParts = containerName
					? containerName.split(/[-_]/)
					: [];
				if (containerNameParts.length > 1) {
					console.log(
						`Trying to match by container name parts: ${containerNameParts.join(", ")}`,
					);

					const updatedRoutesByName = currentRoutes.filter((route) => {
						if (!route.serviceId) {
							return true; // Keep routes without serviceId
						}

						let shouldKeep = true;

						// Check if the route's serviceId contains any part of the container name
						for (const part of containerNameParts) {
							if (part && part.length > 3 && route.serviceId.includes(part)) {
								console.log(
									`Found match by name part "${part}" for route: ${route.configValue}`,
								);
								shouldKeep = false;
								break;
							}
						}

						return shouldKeep;
					});

					if (updatedRoutesByName.length !== currentRoutes.length) {
						console.log(
							`Removed ${currentRoutes.length - updatedRoutesByName.length} routes by name pattern matching`,
						);
						router.setRoutes(updatedRoutesByName);
						return true; // Routes were removed
					}
				}

				return false; // No routes were removed
			}
		}

		const request = http.request(options, callback);
		request.on("error", (error) => {
			console.error("Docker event stream error:", error);
			uiServer?.logEvent(`Error watching Docker events: ${error.message}`);
		});
		request.end();
	});
}

export default watchDockerForChanges;
