export const LogLevel = {
	ERROR: 0,
	WARN: 1,
	INFO: 2,
	DEBUG: 3,
} as const;

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

export interface Logger {
	error: (...args: unknown[]) => void;
	warn: (...args: unknown[]) => void;
	info: (...args: unknown[]) => void;
	debug: (...args: unknown[]) => void;
}

function getLogLevel(): number {
	const envLevel = process.env.LOG_LEVEL?.toUpperCase();
	switch (envLevel) {
		case "ERROR":
			return LogLevel.ERROR;
		case "WARN":
			return LogLevel.WARN;
		case "INFO":
			return LogLevel.INFO;
		case "DEBUG":
			return LogLevel.DEBUG;
		default:
			return LogLevel.INFO; // Default to INFO level
	}
}

const currentLogLevel = getLogLevel();

export function createLogger(module: string): Logger {
	return {
		error: (...args: unknown[]) => {
			if (currentLogLevel >= LogLevel.ERROR) {
				console.error(`[${module}]`, ...args);
			}
		},
		warn: (...args: unknown[]) => {
			if (currentLogLevel >= LogLevel.WARN) {
				console.log(`[${module}]`, ...args);
			}
		},
		info: (...args: unknown[]) => {
			if (currentLogLevel >= LogLevel.INFO) {
				console.log(`[${module}]`, ...args);
			}
		},
		debug: (...args: unknown[]) => {
			if (currentLogLevel >= LogLevel.DEBUG) {
				console.log(`[${module}] DEBUG:`, ...args);
			}
		},
	};
}
