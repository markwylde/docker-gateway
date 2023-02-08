import fs from 'fs';
import tls from 'tls';
import forge from 'node-forge';
import { globby } from 'globby';

function createSecureContext (cert, key) {
  try {
    return tls.createSecureContext({
      cert,
      key
    });
  } catch (error) {
    if (error.code === 'ERR_OSSL_X509_KEY_VALUES_MISMATCH') {
      return false;
    }
    throw error;
  }
}

async function seekCertificiates () {
  const files = await globby([process.env.CERT_PATTERN || '/certs/**.pem']);

  const certs = [];
  const keys = [];
  const pairs = {};

  for (const file of files) {
    const data = await fs.promises.readFile(file, 'utf8');

    try {
      const cert = forge.pki.certificateFromPem(data);
      certs.push({
        cert,
        data,
        file
      });
    } catch (error) {

    }

    try {
      const key = forge.pki.privateKeyFromPem(data);
      keys.push({
        key,
        data,
        file
      });
    } catch (error) {

    }
  }

  for (const cert of certs) {
    const commonName = cert.cert.issuer.attributes.find(a => a.name === 'commonName')?.value;
    if (!commonName) {
      console.log(`failed to add ${cert.file} as cert had no commonName`);
      continue;
    }
    pairs[commonName] = { cert };

    for (const key of keys) {
      const secureContext = createSecureContext(cert.data, key.data);
      if (secureContext) {
        pairs[commonName].key = key;
        pairs[commonName].secureContext = secureContext;
        break;
      }
    }
  }

  return pairs;
}

export default seekCertificiates;
