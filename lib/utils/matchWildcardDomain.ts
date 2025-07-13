const matchWildcardDomain = (test: string, serverName: string): boolean => {
	const [, ...topServerNameParts] = serverName.split(".");
	const topServerName = topServerNameParts.join(".");
	return `*.${topServerName}` === test;
};

export default matchWildcardDomain;
