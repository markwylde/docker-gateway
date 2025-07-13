# docker-gateway
This project provides a gateway for use with Docker, allowing you to proxy multiple services from multiple domains.

## Features
- Expose an http server
- Expose an https server using your custom certificates
- Works with websockets
- Manage routes via your swarm or compose labels

## Local test
To test the examples, add this to your local `/etc/hosts` file:
```text
127.0.0.1	one.test two.test something.three.test
```

Then run the example below, [docker-compose.yml](docker-compose.yml) or [docker-swarm.yml](docker-swarm.yml).

## Syntax
Labels can be used to set some rules for the proxy. There are two available symbols:

`->` is a transparent proxy to the url on right

`=>` is a 301 redirect proxy to the url on right

### Client IP Filtering (Optional)
You can optionally prefix any rule with a client IP address or CIDR range to restrict access based on the client's source IP:

```
<CLIENT_IP_OR_CIDR> -> <RULE>
```

For example:
- `127.0.0.1 -> http://example.com/(.*) -> http://backend:8080/$1` - Only accepts requests from client IP 127.0.0.1
- `100.0.0.0/8 -> https://admin.example.com/(.*) -> http://admin:8080/$1` - Only accepts requests from Tailscale network (100.0.0.0/8)
- `192.168.0.0/16 -> https://internal.example.com/(.*) -> http://internal:8080/$1` - Only accepts requests from private network

Routes without a client IP prefix will accept requests from any client IP address.

**Note**: docker-gateway uses the direct connection IP address (socket.remoteAddress) for client IP filtering. X-Forwarded-For headers are not trusted and are ignored for security reasons.

## Environment Variables

- `HTTP_PORT` - Port for HTTP server (default: 80)
- `HTTPS_PORT` - Port for HTTPS server (default: 443)
- `UI_PORT` - Port for web UI server (default: 8080)
- `DOCKER_URL` - Docker API endpoint (default: /var/run/docker.sock)
- `CERT_PATTERN` - Glob pattern for SSL certificates (default: /certs/**.pem)
- `LOG_LEVEL` - Logging verbosity: ERROR, WARN, INFO, DEBUG (default: INFO)

## Example
```yaml
version: "3"

services:
  readonly-docker:
    image: tecnativa/docker-socket-proxy
    privileged: true
    environment:
      CONTAINERS: 1
      SERVICES: 1
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock

  docker-gateway:
    image: ghcr.io/markwylde/docker-gateway:master
    ports:
      - 80:80
      - 443:443
    environment:
      DOCKER_URL: http://readonly-docker:2375
      CERT_PATTERN: /certs/**.pem
      LOG_LEVEL: INFO  # Options: ERROR, WARN, INFO, DEBUG (default: INFO)
    volumes:
      - ../certs:/certs:ro

  example1:
    image: example
    deploy:
      labels:
        docker-gateway.0: http://one.test/(.*) => https://one.test/$$1
        docker-gateway.1: https://one.test/(.*) -> http://example1:8080/$$1

  example2:
    image: example
    deploy:
      labels:
        docker-gateway.0: http://two.test/(.*) => https://two.test/$$1
        docker-gateway.1: https://two.test/(.*) -> http://example2:8080/$$1

  example3:
    image: example
    deploy:
      labels:
        docker-gateway.0: https://something.three.test/(.*) -> http://example3:8080/$$1

  example4:
    image: example
    deploy:
      labels:
        # Only accessible from Tailscale network
        docker-gateway.0: 100.0.0.0/8 -> http://internal.test/(.*) -> http://example4:8080/$$1
        docker-gateway.1: 100.0.0.0/8 -> https://internal.test/(.*) -> http://example4:8080/$$1
        # Only accessible from private networks
        docker-gateway.2: 192.168.0.0/16 -> http://admin.test/(.*) -> http://example4:8080/admin/$$1
        # Public access from any IP
        docker-gateway.3: http://public.test/(.*) -> http://example4:8080/public/$$1

```
