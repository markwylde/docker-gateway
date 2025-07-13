import type { Server } from "node:http";
import type { SecureContext } from "node:tls";

export interface Route {
	configValue: string;
	bindIp: string | null;
	incomingHost: string;
	incomingHostQuery: RegExp;
	serviceId: string;
	serviceName: string;
	target: URL;
	type: "proxy" | "redirect";
}

export interface Router {
	routes: Route[];
	getRoutes: () => Route[];
	setRoutes: (routes: Route[]) => void;
	uiServer?: UiServer;
}

export interface Certificate {
	secureContext: SecureContext;
	cert: string;
	key: string;
}

export interface DockerContainer {
	Id?: string;
	ID?: string;
	Names?: string[];
	Labels?: Record<string, string>;
}

export interface DockerService {
	Id?: string;
	ID?: string;
	Spec?: {
		Name?: string;
		Labels?: Record<string, string>;
	};
	Config?: {
		Labels?: Record<string, string>;
	};
	Labels?: Record<string, string>;
}

export interface UiServer {
	start: (port: number | string) => Promise<Server>;
	updateRoutes: (routes: Route[]) => void;
	logEvent: (event: string) => void;
	logChange?: (event: string) => void;
}
