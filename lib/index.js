import watchDockerForChanges from './modules/watchDockerForChanges.js';
import listRoutesFromServices from './modules/listRoutesFromServices.js';
import createProxyServer from './modules/createProxyServer.js';
import seekCertificates from './utils/seekCertificates.js';
import createRouter from './utils/createRouter.js';

const router = createRouter();
const certificates = await seekCertificates();

listRoutesFromServices(router);
watchDockerForChanges(router);
createProxyServer(router, certificates);
