import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";
import { attachRealtime } from './scripts/realtime.ts';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  for (const key of ['MONGODB_URI', 'APP_ORIGIN', 'DEMO_MODE']) {
    if (env[key] !== undefined && process.env[key] === undefined) process.env[key] = env[key];
  }
  return {
  plugins: [tailwindcss(), reactRouter(), { name: 'omyquant-socket-io', configureServer(server) { if (server.httpServer) { const io = attachRealtime(server.httpServer); server.httpServer.once('close', () => { void io.close(); }); } } }],
  resolve: {
    tsconfigPaths: true,
  },
};
});
