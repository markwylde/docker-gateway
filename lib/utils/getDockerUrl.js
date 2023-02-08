function getDockerUrl () {
  const dockerHost = process.env.DOCKER_URL || '/var/run/docker.sock';

  if (dockerHost.startsWith('/')) {
    return {
      socketPath: dockerHost
    };
  }

  const url = new URL(dockerHost);

  return {
    host: url.hostname,
    port: url.port
  };
}

export default getDockerUrl;
