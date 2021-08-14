const http = require('http');
const axios = require('axios');

const addRoute = require('./addRoute');

function watchDockerForChanges (routes) {
  const options = {
    socketPath: '/var/run/docker.sock',
    // path: '/events?filters={%22event%22:[%22start%22,%22stop%22,%22kill%22]}',
    path: '/events'
  };

  const callback = res => {
    if (res.statusCode === 200) {
      console.log('Watching docker for changes');
    }
    res.setEncoding('utf8');
    res.on('data', data => parseDockerEvent(JSON.parse(data)));
    res.on('error', data => console.error(data));
  };

  function parseDockerEvent (response) {
    if (response.Type === 'service') {
      getLabelsFromService(response);
    }
  }

  function getLabelsFromService (service) {
    console.log(`Removing any existing routes for "${service.Actor.Attributes.name}" service`);
    routes.forEach((route, routeIndex) => {
      if (route.serviceId === service.Actor.ID) {
        routes.splice(routeIndex, 1);
      }
    });

    return axios({
      url: `/v1.24/services/${service.Actor.ID}`,
      socketPath: '/var/run/docker.sock'
    }).then(service => {
      addRoute(routes, service.data);
    }).catch(error => {
      console.log(error.message);
      const existingRouteIndex = routes.find(route => route.serviceId === service.Actor.ID);
      if (existingRouteIndex) {
        routes.splice(existingRouteIndex, 1);
      }
    });
  }

  http.request(options, callback).end();
}

module.exports = watchDockerForChanges;
