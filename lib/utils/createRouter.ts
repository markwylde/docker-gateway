import type { Route, Router } from "../types.ts";

function createRouter(routes: Route[] = []): Router {
	const router: Router = {
		routes,
		getRoutes: () => router.routes,
		setRoutes: (newRoutes: Route[]) => {
			router.routes = [...newRoutes].sort((a, b) =>
				a.incomingHost < b.incomingHost ? 1 : -1,
			);
		},
	};

	return router;
}

export default createRouter;
