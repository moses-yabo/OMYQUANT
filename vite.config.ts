import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, loadEnv } from "vite";
import { attachRealtime } from './scripts/realtime.ts';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  for (const key of ['MONGODB_URI', 'MONGODB_DB_USERNAME', 'MONGODB_PASSWORD', 'MONGODB_DB_NAME', 'APP_ORIGIN', 'DEMO_MODE', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'GEOAPIFY_API_KEY', 'REDIS_CACHE_ENABLED', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN', 'REDIS_CACHE_NAMESPACE']) {
    if (env[key] !== undefined && process.env[key] === undefined) process.env[key] = env[key];
  }
  return {
  plugins: [
    {
      name: 'omyquant-devtools-probe',
      enforce: 'pre',
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          // Chrome's optional workspace discovery is not an application route.
          const path = request.url?.split('?')[0];
          if (path !== '/.well-known/appspecific/com.chrome.devtools.json') return next();
          response.statusCode = 404;
          response.setHeader('Cache-Control', 'no-store');
          response.end();
        });
      },
    },
    reactRouter(),
    { name: 'omyquant-socket-io', configureServer(server) { if (server.httpServer) { const io = attachRealtime(server.httpServer, { async authenticateSupport(cookie) {
      const { handleApi } = await server.ssrLoadModule('/app/.server/api.ts');
      const response = await handleApi(new Request('http://localhost/api/v1/users/me', { headers: { Cookie: cookie } }), 'users/me');
      if (!response.ok) throw new Error('Authentication required');
      const { data } = await response.json();
      if (!data?._id) throw new Error('Authentication required');
      return { id: String(data._id), admin: Boolean(data.admin || data.superAdmin) };
    } }); server.httpServer.once('close', () => { void io.close(); }); } } },
  ],
  resolve: {
    tsconfigPaths: true,
  },
};
});
