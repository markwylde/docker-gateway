import axios from 'axios';

import getRoutes from '../utils/getRoutes.js';

async function listRoutesFromServices (router) {
  const containers = await axios({
    url: '/v1.24/containers/json',
    socketPath: '/var/run/docker.sock'
  });

  const services = await axios({
    url: '/v1.24/services',
    socketPath: '/var/run/docker.sock'
  });

  const all = [
    ...containers.data,
    ...services.data
  ];

  const routes = all
    .map(getRoutes)
    .flat()
    .filter(route => route);

  router.setRoutes(routes);
}

export default listRoutesFromServices;
