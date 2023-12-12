FROM node:20-alpine

RUN apk update && apk add openssl

ADD package.json package.json

RUN npm install

ADD lib lib

CMD ["node", "lib"]
