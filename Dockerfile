FROM node:18-alpine

RUN apk update && apk add openssl

ADD package.json package.json

RUN npm install

ADD lib lib

CMD ["node", "lib"]
