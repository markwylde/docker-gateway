import http from 'http';
import getDockerUrl from '../utils/getDockerUrl.js';
import finalStream from 'final-stream';
import getRoutes from '../utils/getRoutes.js';

const httpGet = (options) => new Promise((resolve, reject) => {
  const callback = async response => {
    if (response.statusCode !== 200) {
      try {
        const data = await finalStream(response).then(JSON.parse);
        console.log('ERROR', response.statusCode, data);
      } catch (error) {
        console.log('ERROR', error);
      }
      reject(new Error('could not query docker'));
      return;
    }

    console.log('Watching docker for changes');

    response.on('error', data => console.error(data));

    const data = await finalStream(response).then(JSON.parse);
    resolve(data);
    response.destroy();
  };

  http.request(options, callback).end();
});

async function listRoutesFromServices (router, stoppingContainers = new Set()) {
  console.log('DONE', getDockerUrl());

  // Log the current stopping containers
  if (stoppingContainers.size > 0) {
    console.log(`Current stopping containers (${stoppingContainers.size}): ${Array.from(stoppingContainers).join(', ')}`);
  }

  const containers = await httpGet({
    ...getDockerUrl(),
    path: '/v1.24/containers/json'
  });
  const services = await httpGet({
    ...getDockerUrl(),
    path: '/v1.24/services'
  });

  // Filter out containers that are in the process of stopping
  const filteredContainers = containers.filter(container => {
    const containerId = container.Id || container.ID;
    const containerName = container.Names?.[0]?.replace(/^\//, '') || 'unknown';
    const labels = container.Labels || {};

    // Extract service name from Docker Compose container name
    let serviceName = null;
    if (containerName.includes('_') && containerName.split('_').length >= 2) {
      const parts = containerName.split('_');
      const lastPart = parts[parts.length - 1];
      if (/^\d+$/.test(lastPart)) {
        serviceName = parts.slice(1, -1).join('_');
      }
    } else if (containerName.includes('-')) {
      const parts = containerName.split('-');
      const lastPart = parts[parts.length - 1];
      if (/^\d+$/.test(lastPart)) {
        serviceName = parts.slice(0, -1).join('-');
      }
    }

    // Also check Docker Compose labels
    const composeService = labels['com.docker.compose.service'];
    if (composeService) {
      serviceName = composeService;
    }

    // Check if this container is in the stopping containers set
    const isStoppingById = stoppingContainers.has(containerId);
    const isStoppingByName = stoppingContainers.has(containerName);
    const isStoppingByService = serviceName && stoppingContainers.has(serviceName);

    // If the container is stopping, log it and filter it out
    if (isStoppingById || isStoppingByName || isStoppingByService) {
      console.log(`Filtering out stopping container: ${containerName} (${containerId}), service: ${serviceName}`);
      return false;
    }

    return true;
  });

  // Filter out services that are in the process of stopping
  const filteredServices = services.filter(service => {
    const serviceId = service.ID || service.Id;
    const serviceName = service.Spec?.Name || 'unknown';

    // Check if this service is in the stopping containers set
    const isStoppingById = stoppingContainers.has(serviceId);
    const isStoppingByName = stoppingContainers.has(serviceName);

    // If the service is stopping, log it and filter it out
    if (isStoppingById || isStoppingByName) {
      console.log(`Filtering out stopping service: ${serviceName} (${serviceId})`);
      return false;
    }

    return true;
  });

  // Log the filtering results
  if (stoppingContainers.size > 0) {
    console.log(`Filtered out ${containers.length - filteredContainers.length} containers and ${services.length - filteredServices.length} services that are stopping`);
  }

  const all = [
    ...filteredContainers,
    ...filteredServices
  ];

  const routes = all
    .map(getRoutes)
    .flat()
    .filter(route => route);

  // Log the routes that will be set
  console.log(`Setting ${routes.length} routes after filtering out stopping containers`);
  if (routes.length > 0) {
    routes.forEach(route => {
      console.log(`Active route: ${route.configValue} for service ${route.serviceId}`);
    });
  }

  router.setRoutes(routes);
}

export default listRoutesFromServices;
