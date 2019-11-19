const watchDockerForChanges = require('./modules/watchDockerForChanges')
const listRoutesFromServices = require('./modules/listRoutesFromServices')
const createProxyServer = require('./modules/createProxyServer')
const routes = []

listRoutesFromServices(routes)
watchDockerForChanges(routes)
createProxyServer(routes)
