import http from 'http';
import getDockerUrl from '../utils/getDockerUrl.js';

import getRoutes from '../utils/getRoutes.js';

const ugh = (options) => new Promise(resolve => {
  const callback = response => {
    if (response.statusCode === 200) {
      console.log('Watching docker for changes');
    }
    response.setEncoding('utf8');
    response.on('data', data => {
      resolve(JSON.parse(data));
      response.destroy();
    });
    response.on('error', data => console.error(data));
  };

  http.request(options, callback).end();
});

async function listRoutesFromServices (router) {
  const containers = await ugh({
    ...getDockerUrl(),
    path: '/v1.24/containers/json'
  });

  const services = await ugh({
    ...getDockerUrl(),
    path: '/v1.24/services'
  });

  const all = [
    ...containers,
    ...services
  ];

  const routes = all
    .map(getRoutes)
    .flat()
    .filter(route => route);

  router.setRoutes(routes);
}

export default listRoutesFromServices;
