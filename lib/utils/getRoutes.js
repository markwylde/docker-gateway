function getRoutes (entity) {
  try {
    // Get entity type for better logging
    const entityType = entity.Spec ? 'service' :
                      entity.Status ? 'task' :
                      'container';

    const entityId = entity.ID || entity.Id || entity.ServiceID;
    if (!entityId) {
      console.warn('Entity missing ID:', entity);
      return [];
    }

    // Collect labels from all possible sources
    const labels = {
      // Container labels
      ...entity.Labels,
      // Service spec labels
      ...entity.Spec?.Labels,
      // Service config labels
      ...entity.Config?.Labels,
      // Task labels
      ...entity.Status?.Labels
    };

    if (!labels || Object.keys(labels).length === 0) {
      console.debug(`No labels found for ${entityType} ${entityId}`);
      return [];
    }

    const routes = Object.entries(labels)
      .filter(([key]) => key.startsWith('docker-gateway.'))
      .map(([labelKey, configValue]) => {
        try {
          if (!configValue || typeof configValue !== 'string') {
            console.warn(`Invalid label value for ${labelKey} on ${entityType} ${entityId}:`, configValue);
            return null;
          }

          // Determine route type and split configuration
          const type = configValue.includes(' -> ') ? 'proxy' :
                      configValue.includes(' => ') ? 'redirect' : null;

          if (!type) {
            console.warn(`Invalid route format for ${labelKey} on ${entityType} ${entityId}: ${configValue}`);
            console.warn('Expected format: "hostname -> target" for proxy or "hostname => target" for redirect');
            return null;
          }

          const separator = type === 'proxy' ? ' -> ' : ' => ';
          const [hostname, target] = configValue.split(separator);

          if (!hostname || !target) {
            console.warn(`Missing hostname or target in ${labelKey} on ${entityType} ${entityId}: ${configValue}`);
            return null;
          }

          // Validate hostname pattern
          try {
            new RegExp(hostname);
          } catch (error) {
            console.warn(`Invalid hostname pattern in ${labelKey} on ${entityType} ${entityId}: ${hostname}`);
            return null;
          }

          // Validate target URL
          let targetUrl;
          try {
            targetUrl = new URL(target);
          } catch (error) {
            console.warn(`Invalid target URL in ${labelKey} on ${entityType} ${entityId}: ${target}`);
            return null;
          }

          console.log(`Adding ${type} route for ${entityType} ${entityId}:`, {
            hostname,
            target: targetUrl.toString()
          });

          return {
            configValue,
            incomingHost: hostname,
            incomingHostQuery: new RegExp(hostname),
            serviceId: entityId,
            target: targetUrl,
            type,
            source: {
              type: entityType,
              id: entityId,
              label: labelKey
            }
          };
        } catch (error) {
          console.error(`Error processing route for ${labelKey} on ${entityType} ${entityId}:`, error);
          return null;
        }
      })
      .filter(route => route !== null);

    if (routes.length === 0) {
      console.debug(`No valid routes found for ${entityType} ${entityId}`);
    }

    return routes;
  } catch (error) {
    console.error('Error in getRoutes:', error);
    return [];
  }
}

export default getRoutes;
