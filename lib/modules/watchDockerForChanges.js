import http from 'http';
import getDockerUrl from '../utils/getDockerUrl.js';
import listRoutesFromServices from './listRoutesFromServices.js';
import ndJsonFe from 'ndjson-fe';

function watchDockerForChanges (router) {
  return new Promise((resolve) => {
    const options = {
      ...getDockerUrl(),
      // path: '/events?filters={%22event%22:[%22start%22,%22stop%22,%22kill%22]}',
      path: '/events'
    };

    const callback = (response) => {
      if (response.statusCode === 200) {
        console.log('Watching docker for changes');
      }
      response.setEncoding('utf8');

      const feed = ndJsonFe();

      feed.on('next', (data) => parseDockerEvent(data));
      feed.on('error', (data) => console.error(data));
      feed.on('end', () => {
        console.log('The stream has finished');
      });

      response.pipe(feed);

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
