const http = require('http');
const axios = require('axios')

function watchDockerForChanges (routes) {
  const options = {
    socketPath: '/var/run/docker.sock',
    //path: '/events?filters={%22event%22:[%22start%22,%22stop%22,%22kill%22]}',
    path: '/events',
  };
  
  const callback = res => {
    if (res.statusCode === 200) {
      console.log('Watching docker for changes')
    }
    res.setEncoding('utf8');
    res.on('data', data => parseDockerEvent(JSON.parse(data)));
    res.on('error', data => console.error(data));
  };
  
  function parseDockerEvent (response) {
    if (response.Type === 'service') {
      getLabelsFromService(response.Actor.ID)
    }
  }
  
  function getLabelsFromService (serviceId) {
    axios({
      url: `/v1.24/services/${serviceId}`,
      socketPath: '/var/run/docker.sock'
    }).then(service => {
      const incomingUrl = service.data.Spec.Labels['external.proxy.incoming_url']
      const serviceName = service.data.Spec.Name
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
    }).catch(error => {
      const existingRouteIndex = routes.find(route => route.serviceId === serviceId)
      if (existingRouteIndex) {
        routes.splice(existingRouteIndex,1)
      }
    })
  }

  http.request(options, callback).end()
}

module.exports = watchDockerForChanges
