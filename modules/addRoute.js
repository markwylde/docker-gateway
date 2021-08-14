function addRoute (routes, service) {
  Object.keys(service.Spec.Labels).forEach(labelKey => {
    if (!labelKey.startsWith('docker-gateway.')) {
      return;
    }

    const incomingUrl = service.Spec.Labels[labelKey];
    const serviceName = service.Spec.Name;

    console.log(`Adding route to "${serviceName}" from ${incomingUrl}`);

    if (incomingUrl) {
      const existingRouteIndex = routes.find(route => route.incomingUrl === incomingUrl);
      if (existingRouteIndex) {
        routes.splice(existingRouteIndex, 1);
      }

      routes.push({
        incomingUrl,
        serviceId: service.ID,
        serviceName
      });
    }
  });
}

module.exports = addRoute;
