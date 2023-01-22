function getRoutes (service) {
  const labels = {
    ...service.Labels,
    ...service.Spec?.Labels,
    ...service.Config?.Labels
  };

  return Object.keys(labels).map(labelKey => {
    if (!labelKey.startsWith('docker-gateway.')) {
      return;
    }

    const configValue = labels[labelKey];
    const serviceId = service.Id || service.ID

    console.log(`Adding route to "${serviceId}" from ${configValue}`);

    if (configValue) {
      const [hostname, target] = configValue.split(' -> ');

      return {
        configValue,
        incomingHost: hostname,
        serviceId: serviceId,
        target: new URL(target)
      };
    }
  });
}

export default getRoutes;
