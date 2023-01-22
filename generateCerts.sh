#!/usr/bin/env sh
mkdir -p certs
openssl genrsa -out certs/key.pem
openssl req -newkey rsa:2048 -nodes -keyout certs/key.pem -x509 -days 3650 -out certs/cert.pem -subj "/C=GB/ST=London/L=London/O=Local Development/OU=IT Department/CN=localhost"
