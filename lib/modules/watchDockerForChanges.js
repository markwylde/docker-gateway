import http from 'http';
import getDockerUrl from '../utils/getDockerUrl.js';
import listRoutesFromServices from './listRoutesFromServices.js';

function watchDockerForChanges (router) {
  const options = {
    ...getDockerUrl(),
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
      listRoutesFromServices(router);
    }
  }

  http.request(options, callback).end();
}

export default watchDockerForChanges;
