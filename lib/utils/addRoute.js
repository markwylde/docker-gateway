function addRoute (routes, service) {
  const labels = {
    ...service.Labels,
    ...service.Spec?.Labels,
    ...service.Config?.Labels
  };

  Object.keys(labels).forEach(labelKey => {
    if (!labelKey.startsWith('docker-gateway.')) {
      return;
    }

    const configValue = labels[labelKey];

    console.log(`Adding route to "${service.Id}" from ${configValue}`);

    if (configValue) {
      const existingRouteIndex = routes.find(route => route.configValue === configValue);
      if (existingRouteIndex) {
        routes.splice(existingRouteIndex, 1);
      }

      const [hostname, target] = configValue.split(' -> ');

      routes.push({
        configValue,
        incomingHost: hostname,
        serviceId: service.Id,
        target: new URL(target)
      });
    }
  });
}

export default addRoute;
