import http from 'http';
import axios from 'axios';

import addRoute from '../utils/addRoute.js';

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
    if (response.Type === 'container') {
      getLabels(response);
    }
  }

  function getLabels (container) {
    const url = `/v1.24/containers/${container.Actor.ID}/json`;

    console.log(`Removing any existing routes for "${container.Actor.Attributes.name}" container`);
    routes.forEach((route, routeIndex) => {
      if (route.containerId === container.Actor.ID) {
        routes.splice(routeIndex, 1);
      }
    });

    return axios({
      url,
      socketPath: '/var/run/docker.sock'
    }).then(container => {
      addRoute(routes, container.data);
    }).catch(error => {
      console.log(error.message);
      const existingRouteIndex = routes.find(route => route.containerId === container.Actor.ID);
      if (existingRouteIndex) {
        routes.splice(existingRouteIndex, 1);
      }
    });
  }

  http.request(options, callback).end();
}

export default watchDockerForChanges;
