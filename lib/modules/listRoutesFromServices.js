import axios from 'axios';

import addRoute from '../utils/addRoute.js';

async function listRoutesFromServices (routes) {
  const containers = await axios({
    url: '/v1.24/containers/json',
    socketPath: '/var/run/docker.sock'
  });

  containers.data.forEach(addRoute.bind(null, routes));
}

export default listRoutesFromServices;
