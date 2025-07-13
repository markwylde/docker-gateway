function getRoutes(service) {
	const labels = {
		...service.Labels,
		...service.Spec?.Labels,
		...service.Config?.Labels,
	};

	const serviceId = service.Id || service.ID;
	const serviceName =
		service.Spec?.Name || service.Names?.[0]?.replace(/^\//, "") || "unknown";

	// Log the service information
	console.log(`Getting routes for service: ${serviceName} (${serviceId})`);

	return Object.keys(labels).map((labelKey) => {
		if (!labelKey.startsWith("docker-gateway.")) {
			return null;
		}

		const configValue = labels[labelKey];

		console.log(`Adding route to "${serviceId}" from ${configValue}`);

		if (configValue) {
			let bindIp = null;
			let routeConfig = configValue;

			// Check if the config starts with an IP address prefix
			const ipMatch = configValue.match(/^(\d+\.\d+\.\d+\.\d+)\s*->\s*(.+)$/);
			if (ipMatch) {
				bindIp = ipMatch[1];
				routeConfig = ipMatch[2];
			}

			const type = routeConfig.includes(" -> ") ? "proxy" : "redirect";

			// Parse the route config to extract hostname and target
			const parts = routeConfig.split(type === "redirect" ? " => " : " -> ");
			const hostname = parts[0];
			const target = parts[1];

			return {
				configValue,
				bindIp,
				incomingHost: hostname,
				incomingHostQuery: new RegExp(hostname),
				serviceId,
				serviceName,
				target: new URL(target),
				type,
			};
		}

		return null;
	});
}

export default getRoutes;
