import type { RequestOptions } from "node:http";

function getDockerUrl(): Pick<RequestOptions, "socketPath" | "host" | "port"> {
	const dockerHost = process.env.DOCKER_URL || "/var/run/docker.sock";

	if (dockerHost.startsWith("/") || dockerHost.startsWith("unix://")) {
		return {
			socketPath: dockerHost.startsWith("unix://")
				? dockerHost.slice(7)
				: dockerHost,
		};
	}

	const url = new URL(dockerHost);

	return {
		host: url.hostname,
		port: url.port,
	};
}

export default getDockerUrl;
