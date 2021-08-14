const fs = require('fs');

module.exports = {
  key: fs.readFileSync(process.env.SSL_KEY_PATH),
  cert: fs.readFileSync(process.env.SSL_CERT_PATH),
  ca: process.env.SSL_CHAIN_PATH && fs.readFileSync(process.env.SSL_CHAIN_PATH)
};
