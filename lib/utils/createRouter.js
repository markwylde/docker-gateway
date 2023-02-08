function createRouter (routes = []) {
  const router = {
    routes,
    getRoutes: () => router.routes,
    setRoutes: (newRoutes) => {
      router.routes = [
        ...newRoutes
      ].sort((a, b) => a.incomingHost < b.incomingHost ? 1 : -1);
    }
  };

  return router;
}

export default createRouter;
