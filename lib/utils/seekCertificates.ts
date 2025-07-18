import { exec } from "node:child_process";
import fs from "node:fs";
import tls, { type SecureContext } from "node:tls";
import util from "node:util";
import { globby } from "globby";
import type { Certificate } from "../types.ts";

const execPromise = util.promisify(exec);

function createSecureContext(cert: string, key: string): SecureContext | false {
	try {
		return tls.createSecureContext({
			cert,
			key,
		});
	} catch (error) {
		if (
			error instanceof Error &&
			"code" in error &&
			error.code === "ERR_OSSL_X509_KEY_VALUES_MISMATCH"
		) {
			return false;
		}
		throw error;
	}
}

async function getDomainsFromFile(path: string): Promise<string[]> {
	const data = await fs.promises.readFile(path, "utf8");
	const pemCerts = data.match(
		/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g,
	);

	if (!pemCerts) {
		throw new Error("No certificates found in the file");
	}

	return Promise.all(pemCerts.map(getDomainsFromCert)).then((i) => i.flat());
}

async function getDomainsFromCert(pemCert: string): Promise<string[]> {
	const { stdout } = await execPromise(
		`echo '${pemCert}' | openssl x509 -noout -text`,
	);
	const commonNameRegex = /Subject:.*? CN\s*=\s*([^\s,]+)/;
	const altNameRegex =
		/X509v3 Subject Alternative Name:\s*((?:\s+[^\s,]+(?:,\s+)?)+)/;
	const commonNameMatch = stdout.match(commonNameRegex);
	const altNamesMatch = stdout.match(altNameRegex);
	const commonName = commonNameMatch ? commonNameMatch[1] : null;
	const altNames = (
		altNamesMatch ? altNamesMatch[1].trim().split(/\s*,\s*/) : []
	).map((altName) => altName.replace("DNS:", ""));

	return [commonName, ...altNames].filter(
		(name): name is string => name !== null,
	);
}

async function seekCertificiates(): Promise<Record<string, Certificate>> {
	const files = await globby([process.env.CERT_PATTERN || "/certs/**.pem"]);

	const certs: Array<{ domain: string; data: string; file: string }> = [];
	const keys: Array<{ file: string; data: string }> = [];
	const pairs: Record<
		string,
		Certificate & { domain?: string; file?: string }
	> = {};

	for (const file of files) {
		const data = await fs.promises.readFile(file, "utf8");
		try {
			const domains = await getDomainsFromFile(file);
			for (const domain of domains) {
				certs.push({
					domain,
					data,
					file,
				});
			}
		} catch (_error) {
			keys.push({
				file,
				data,
			});
		}
	}

	for (const cert of certs) {
		pairs[cert.domain] = {
			...cert,
			key: "",
			cert: cert.data,
			secureContext: {} as SecureContext, // will be replaced below
		};
		for (const key of keys) {
			const secureContext = createSecureContext(cert.data, key.data);
			if (secureContext) {
				pairs[cert.domain].key = key.data;
				pairs[cert.domain].cert = cert.data;
				pairs[cert.domain].secureContext = secureContext;
				break;
			}
		}
	}

	return pairs;
}

export default seekCertificiates;
