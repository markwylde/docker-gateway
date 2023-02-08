import http from 'http';
import getDockerUrl from '../utils/getDockerUrl.js';
import finalStream from 'final-stream';
import getRoutes from '../utils/getRoutes.js';

const httpGet = (options) => new Promise((resolve, reject) => {
  const callback = async response => {
    if (response.statusCode !== 200) {
      reject(new Error('could not query docker'));
      return;
    }

    console.log('Watching docker for changes');

    response.on('error', data => console.error(data));

    const data = await finalStream(response).then(JSON.parse);
    resolve(data);
    response.destroy();
  };

  http.request(options, callback).end();
});

async function listRoutesFromServices (router) {
  const containers = await httpGet({
    ...getDockerUrl(),
    path: '/v1.24/containers/json'
  });

  const services = await httpGet({
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
