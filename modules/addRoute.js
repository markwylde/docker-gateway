function addRoute (routes, service) {
  Object.keys(service.Spec.Labels).forEach(labelKey => {
    if (!labelKey.startsWith('docker-gateway.')) {
      return;
    }

    const configValue = service.Spec.Labels[labelKey];
    const serviceName = service.Spec.Name;

    console.log(`Adding route to "${serviceName}" from ${configValue}`);

    if (configValue) {
      const existingRouteIndex = routes.find(route => route.configValue === configValue);
      if (existingRouteIndex) {
        routes.splice(existingRouteIndex, 1);
      }

      const [hostname, port] = configValue.split(' -> ');

      routes.push({
        configValue,
        incomingHost: hostname,
        port: port || 80,
        serviceId: service.ID,
        serviceName
      });
    }
  });
}

module.exports = addRoute;
