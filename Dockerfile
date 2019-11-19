FROM node:12-alpine

ADD package.json package.json

RUN npm install

ADD modules modules
ADD index.js index.js

CMD ["node", "index.js"]
