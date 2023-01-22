FROM node:18-alpine

ADD package.json package.json

RUN npm install

ADD lib lib

CMD ["node", "lib"]
