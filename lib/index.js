import watchDockerForChanges from './modules/watchDockerForChanges.js';
import listRoutesFromServices from './modules/listRoutesFromServices.js';
import createProxyServer from './modules/createProxyServer.js';
import seekCertificates from './utils/seekCertificates.js';

const routes = [];
const certificates = await seekCertificates();

listRoutesFromServices(routes);
watchDockerForChanges(routes);
createProxyServer(routes, certificates);
