FROM node:16-alpine

ADD package.json package.json

RUN npm install

ADD modules modules
ADD config.js config.js
ADD index.js index.js

CMD ["node", "index.js"]
