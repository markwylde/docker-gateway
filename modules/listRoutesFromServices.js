const axios = require('axios')

function listRoutesFromServices (routes) {

  function addRoute (service) {
    const incomingUrl = service.Spec.Labels['external.proxy.incoming_url']
    const serviceName = service.Spec.Name
    const serviceId = service.ID
    if (incomingUrl) {
      const existingRouteIndex = routes.find(route => route.incomingUrl === incomingUrl)
      if (existingRouteIndex) {
        routes.splice(existingRouteIndex,1)
      }

      routes.push({
        incomingUrl,
        serviceId,
        serviceName
      })
    }
  }

  axios({
    url: `/v1.24/services`,
    socketPath: '/var/run/docker.sock'
  }).then(services => {
    services.data.forEach(addRoute)
  })
}

module.exports = listRoutesFromServices
