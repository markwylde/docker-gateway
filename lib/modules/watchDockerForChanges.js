import http from 'http';
import getDockerUrl from '../utils/getDockerUrl.js';
import listRoutesFromServices from './listRoutesFromServices.js';

function watchDockerForChanges (router) {
  return new Promise(resolve => {
    const options = {
      ...getDockerUrl(),
      // path: '/events?filters={%22event%22:[%22start%22,%22stop%22,%22kill%22]}',
      path: '/events'
    };

    const callback = response => {
      if (response.statusCode === 200) {
        console.log('Watching docker for changes');
      }
      response.setEncoding('utf8');
      response.on('data', data => parseDockerEvent(JSON.parse(data)));
      response.on('error', data => console.error(data));

      resolve(() => {
        response.destroy();
      });
    };

    function parseDockerEvent (response) {
      if (response.Type === 'container') {
        listRoutesFromServices(router);
      }
    }

    http.request(options, callback).end();
  });
}

export default watchDockerForChanges;
