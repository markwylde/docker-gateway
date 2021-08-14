const axios = require('axios');

const addRoute = require('./addRoute');

function listRoutesFromServices (routes) {
  axios({
    url: '/v1.24/services',
    socketPath: '/var/run/docker.sock'
  }).then(services => {
    services.data.forEach(addRoute.bind(null, routes));
  });
}

module.exports = listRoutesFromServices;
