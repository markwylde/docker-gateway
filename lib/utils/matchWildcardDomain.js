const matchWildcardDomain = (test, serverName) => {
	const [, ...topServerNameParts] = serverName.split(".");
	const topServerName = topServerNameParts.join(".");
	return `*.${topServerName}` === test;
};

export default matchWildcardDomain;
