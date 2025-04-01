function getRoutes (service) {
  const labels = {
    ...service.Labels,
    ...service.Spec?.Labels,
    ...service.Config?.Labels
  };

  const serviceId = service.Id || service.ID;
  const serviceName = service.Spec?.Name || service.Names?.[0]?.replace(/^\//, '') || 'unknown';

  // Log the service information
  console.log(`Getting routes for service: ${serviceName} (${serviceId})`);

  return Object.keys(labels).map(labelKey => {
    if (!labelKey.startsWith('docker-gateway.')) {
      return null;
    }

    const configValue = labels[labelKey];

    console.log(`Adding route to "${serviceId}" from ${configValue}`);

    if (configValue) {
      const type = configValue.includes(' -> ') ? 'proxy' : 'redirect';

      const [hostname, target] = configValue.split(type === 'redirect' ? ' => ' : ' -> ');

      return {
        configValue,
        incomingHost: hostname,
        incomingHostQuery: new RegExp(hostname),
        serviceId,
        serviceName,
        target: new URL(target),
        type
      };
    }

    return null;
  });
}

export default getRoutes;
