#!/usr/bin/env sh
mkdir -p certs
openssl genrsa -out certs/one.test.key.pem
openssl req -newkey rsa:2048 -nodes -keyout certs/one.test.key.pem -x509 -days 3650 -out certs/one.test.cert.pem -subj "/C=GB/ST=London/L=London/O=Local Development/OU=IT Department/CN=one.test"

openssl genrsa -out certs/two.test.key.pem
openssl req -newkey rsa:2048 -nodes -keyout certs/two.test.key.pem -x509 -days 3650 -out certs/two.test.cert.pem -subj "/C=GB/ST=London/L=London/O=Local Development/OU=IT Department/CN=two.test"

openssl genrsa -out certs/wildcard.three.test.key.pem
openssl req -newkey rsa:2048 -nodes -keyout certs/wildcard.three.test.key.pem -x509 -days 3650 -out certs/wildcard.three.test.cert.pem -subj "/C=GB/ST=London/L=London/O=Local Development/OU=IT Department/CN=*.three.test"
