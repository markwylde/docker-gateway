# docker-gateway
This project provides a gateway for use with Docker, allowing you to proxy multiple services from multiple domains.

## Features
- Expose an http server that force redirects to https
- Expose an https server using your custom certificates
- Works with websockets
- Manage routes via your swarm or compose labels

## Example
```yaml
version: "3"

services:
  docker-gateway:
    image: ghcr.io/markwylde/docker-gateway:master
    ports:
      - 80:80
      - 443:443
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ../certs:/certs

  example1:
    image: example
    deploy:
      labels:
        docker-gateway.0: https://one.hello.test -> http://example1:8080

  example2:
    image: example
    deploy:
      labels:
        docker-gateway.0: https://two.hello.test -> http://example2:8080
```
