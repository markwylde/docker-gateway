function ipToNumber(ip: string): number {
	const parts = ip.split(".");
	return (
		(parseInt(parts[0], 10) << 24) +
		(parseInt(parts[1], 10) << 16) +
		(parseInt(parts[2], 10) << 8) +
		parseInt(parts[3], 10)
	);
}

function isIpInCidr(ip: string, cidr: string): boolean {
	// Handle single IP (no CIDR notation)
	if (!cidr.includes("/")) {
		return ip === cidr;
	}

	const [range, bits] = cidr.split("/");
	const mask = ~(2 ** (32 - parseInt(bits, 10)) - 1);

	return (ipToNumber(ip) & mask) === (ipToNumber(range) & mask);
}

export function isClientIpAllowed(
	clientIp: string | undefined,
	allowedRange: string | null,
): boolean {
	if (!allowedRange || !clientIp) {
		return true; // No restriction if no range specified
	}

	// Normalize IPv6-mapped IPv4 addresses
	let normalizedIp = clientIp;
	if (normalizedIp.startsWith("::ffff:")) {
		normalizedIp = normalizedIp.substring(7);
	}

	// Handle multiple ranges separated by comma
	const ranges = allowedRange.split(",").map((r) => r.trim());

	for (const range of ranges) {
		// Check specific IP or CIDR
		if (isIpInCidr(normalizedIp, range)) {
			return true;
		}
	}

	return false;
}
