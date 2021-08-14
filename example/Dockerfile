FROM node:16-alpine

ADD package.json package.json

RUN npm install

ADD . .

CMD ["node", "index.js"]
