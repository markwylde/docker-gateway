function createRouter (routes = []) {
  const router = {
    routes,
    getRoutes: () => router.routes,
    setRoutes: (newRoutes) => router.routes = newRoutes
  };

  return router;
}

export default createRouter;
