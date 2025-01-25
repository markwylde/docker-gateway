import http from 'http';
import getDockerUrl from '../utils/getDockerUrl.js';
import finalStream from 'final-stream';
import getRoutes from '../utils/getRoutes.js';

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

const httpGet = (options, retryCount = 0) => new Promise((resolve, reject) => {
  const callback = async response => {
    try {
      if (response.statusCode === 404 && options.path.includes('/v1.24/')) {
        // Try without version prefix if 404
        const newPath = options.path.replace('/v1.24/', '/');
        console.log(`Retrying request with unversioned path: ${newPath}`);
        resolve(await httpGet({ ...options, path: newPath }));
        return;
      }

      if (response.statusCode !== 200) {
        throw new Error(`Docker API returned status ${response.statusCode}`);
      }

      response.on('error', error => {
        console.error('Response stream error:', error);
        throw error;
      });

      const data = await finalStream(response).then(JSON.parse);
      resolve(data);
    } catch (error) {
      if (retryCount < MAX_RETRIES) {
        console.log(`Retrying request (${retryCount + 1}/${MAX_RETRIES}) after error:`, error.message);
        setTimeout(() => {
          resolve(httpGet(options, retryCount + 1));
        }, RETRY_DELAY * Math.pow(2, retryCount));
      } else {
        console.error('Request failed after max retries:', error);
        reject(error);
      }
    } finally {
      response.destroy();
    }
  };

  const request = http.request(options, callback);

  request.on('error', error => {
    console.error('Request error:', error);
    if (retryCount < MAX_RETRIES) {
      console.log(`Retrying request (${retryCount + 1}/${MAX_RETRIES})`);
      setTimeout(() => {
        resolve(httpGet(options, retryCount + 1));
      }, RETRY_DELAY * Math.pow(2, retryCount));
    } else {
      reject(error);
    }
  });

  request.end();
});

async function listRoutesFromServices (router) {
  try {
    const [containers, services, tasks] = await Promise.all([
      // Try containers endpoint
      httpGet({
        ...getDockerUrl(),
        path: '/v1.24/containers/json'
      }).catch(error => {
        console.warn('Failed to fetch containers:', error.message);
        return [];
      }),

      // Try services endpoint (swarm mode)
      httpGet({
        ...getDockerUrl(),
        path: '/v1.24/services'
      }).catch(error => {
        console.warn('Failed to fetch services:', error.message);
        return [];
      }),

      // Try tasks endpoint (swarm mode)
      httpGet({
        ...getDockerUrl(),
        path: '/v1.24/tasks?filters=' + encodeURIComponent(JSON.stringify({
          'desired-state': ['running']
        }))
      }).catch(error => {
        console.warn('Failed to fetch tasks:', error.message);
        return [];
      })
    ]);

    // Combine all sources, preferring swarm services/tasks over containers
    const all = [
      ...services,
      ...tasks.filter(task => task.Status.State === 'running'),
      ...containers
    ];

    const routes = all
      .map(getRoutes)
      .flat()
      .filter(route => route);

    if (routes.length === 0) {
      console.warn('No routes found from any source (services, tasks, or containers)');
    } else {
      console.log(`Found ${routes.length} routes from ${services.length} services, ${tasks.length} tasks, and ${containers.length} containers`);
    }

    router.setRoutes(routes);
  } catch (error) {
    console.error('Failed to list routes:', error);
    // Don't update routes on error to avoid clearing existing routes
  }
}

export default listRoutesFromServices;
