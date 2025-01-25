import http from 'http';
import getDockerUrl from '../utils/getDockerUrl.js';
import listRoutesFromServices from './listRoutesFromServices.js';
import ndJsonFe from 'ndjson-fe';

const RECONNECT_DELAY = 5000; // 5 seconds
const MAX_RECONNECT_DELAY = 60000; // 1 minute

function watchDockerForChanges (router) {
  let currentDelay = RECONNECT_DELAY;
  let destroy = null;

  function connect() {
    return new Promise((resolve) => {
      const options = {
        ...getDockerUrl(),
        path: '/events?filters=' + encodeURIComponent(JSON.stringify({
          type: ['container', 'service', 'task', 'node'],
          event: ['start', 'stop', 'kill', 'create', 'update', 'remove']
        }))
      };

      const callback = (response) => {
        if (response.statusCode === 200) {
          console.log('Watching docker for changes');
          currentDelay = RECONNECT_DELAY; // Reset delay on successful connection
        } else {
          console.error(`Docker events stream returned status ${response.statusCode}`);
        }
        response.setEncoding('utf8');

        const feed = ndJsonFe();

        feed.on('next', (data) => parseDockerEvent(data));

        feed.on('error', (error) => {
          console.error('Docker events stream error:', error);
          handleReconnect();
        });

        feed.on('end', () => {
          console.error('Docker events stream ended unexpectedly');
          handleReconnect();
        });

        response.pipe(feed);

        resolve(() => {
          response.destroy();
        });
      };

      function parseDockerEvent (event) {
        try {
          // Handle relevant Docker event types
          if (['container', 'service', 'task', 'node'].includes(event.Type)) {
            console.log(`Received Docker ${event.Type} event: ${event.Action}`);
            listRoutesFromServices(router);
          }
        } catch (error) {
          console.error('Error parsing Docker event:', error);
        }
      }

      const request = http.request(options, callback);

      request.on('error', (error) => {
        console.error('Docker API request error:', error);
        handleReconnect();
      });

      request.end();
    });
  }

  function handleReconnect() {
    if (destroy) {
      destroy();
    }

    console.log(`Attempting to reconnect in ${currentDelay/1000} seconds...`);

    setTimeout(async () => {
      try {
        destroy = await connect();
      } catch (error) {
        console.error('Failed to reconnect:', error);
        // Exponential backoff with max delay
        currentDelay = Math.min(currentDelay * 2, MAX_RECONNECT_DELAY);
        handleReconnect();
      }
    }, currentDelay);
  }

  return connect();
}

export default watchDockerForChanges;
