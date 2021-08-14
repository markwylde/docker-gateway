const fs = require('fs');

module.exports = {
  key: fs.readFileSync(process.env.SSL_KEY_PATH, 'utf8'),
  cert: fs.readFileSync(process.env.SSL_CERT_PATH, 'utf8'),
  ca: process.env.SSL_CHAIN_PATH && fs.readFileSync(process.env.SSL_CHAIN_PATH, 'utf8')
};
