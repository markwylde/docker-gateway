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
			const type = configValue.includes(" -> ") ? "proxy" : "redirect";

			// Parse the config value to extract optional IP address
			const parts = configValue.split(type === "redirect" ? " => " : " -> ");
			let hostname = parts[0];
			const target = parts[1];
			let bindIp = null;

			// Check if the first part contains an IP address prefix
			const ipMatch = hostname.match(/^(\d+\.\d+\.\d+\.\d+)\s+(.+)$/);
			if (ipMatch) {
				bindIp = ipMatch[1];
				hostname = ipMatch[2];
			}

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
