import path from 'path';
import UiServer from './ui/server.js';

import watchDockerForChanges from './modules/watchDockerForChanges.js';
import listRoutesFromServices from './modules/listRoutesFromServices.js';
import createProxyServer from './modules/createProxyServer.js';
import seekCertificates from './utils/seekCertificates.js';
import createRouter from './utils/createRouter.js';

import minimist from 'minimist';

const defaultOptions = {
  httpPort: process.env.HTTP_PORT || 80,
  httpsPort: process.env.HTTPS_PORT || 443
};

export default async function createDockerGateway (passedOptions = defaultOptions) {
  const options = {
    ...defaultOptions,
    ...JSON.parse(JSON.stringify(passedOptions))
  };

  const router = createRouter();
  const certificates = await seekCertificates();
  const uiServer = new UiServer();

  // Start UI server
  const uiHttpServer = await uiServer.start();

  // Attach UI server to router for event logging
  router.uiServer = uiServer;

  // Hook into router to update UI
  const originalSetRoutes = router.setRoutes;
  router.setRoutes = (routes) => {
    originalSetRoutes.call(router, routes);
    uiServer.updateRoutes(routes);
  };

  // Initialize the stoppingContainers set
  const stoppingContainers = new Set();

  // Initial route loading
  await listRoutesFromServices(router, stoppingContainers);

  // Start watching for Docker changes
  const stopWatching = await watchDockerForChanges(router, stoppingContainers, uiServer);

  const stopServers = await createProxyServer(router, certificates, options);

  return () => {
    stopWatching();
    stopServers();
    uiHttpServer.close();
  };
}
const runningAsMain = import.meta.url.endsWith(path.basename(process.argv[1])) ||
  import.meta.url.endsWith(path.basename(process.argv[1]) + '/index.js');

if (runningAsMain) {
  const argv = minimist(process.argv);
  createDockerGateway({
    httpPort: argv['http-port'],
    httpsPort: argv['https-port']
  });
}
