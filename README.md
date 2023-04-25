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
    env:
      DOCKER_URL: http://readonly-docker:2375
      CERT_PATTERN: /certs/**.pem
    volumes:
      - ../certs:/certs:ro

  example1:
    image: example
    deploy:
      labels:
        docker-gateway.0: http://one.test/(.*) => https://one.test/$1
        docker-gateway.1: https://one.test/(.*) -> http://example1:8080/$1

  example2:
    image: example
    deploy:
      labels:
        docker-gateway.0: http://two.test/(.*) => https://two.test/$1
        docker-gateway.1: https://two.test/(.*) -> http://example2:8080/$1

  example3:
    image: example
    deploy:
      labels:
        docker-gateway.0: https://something.three.test/(.*) -> http://example3:8080/$1

```
