function getDockerUrl () {
  const dockerHost = process.env.DOCKER_URL || '/var/run/docker.sock';

  if (dockerHost.startsWith('/')) {
    return {
      socketPath: dockerHost
    }
  }

  return {
    baseURL: dockerHost
  }
}

export default getDockerUrl;
