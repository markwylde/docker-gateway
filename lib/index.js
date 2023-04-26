import path from 'path';

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

  await listRoutesFromServices(router);
  const stopWatching = await watchDockerForChanges(router);
  const stopServers = await createProxyServer(router, certificates, options);

  return () => {
    stopWatching();
    stopServers();
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
