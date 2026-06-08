import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_BACKEND_PROXY_TARGET || 'http://127.0.0.1:3001';

  return {
    plugins: [react()],
    server: {
      port: 3002,
      host: true,
      // Permite o domínio de produção e todos os subdomínios de tenant
      // (frontend roda atrás do nginx em 127.0.0.1:3002).
      allowedHosts: ['.gestaozap.digital', 'localhost', '127.0.0.1'],
      watch: { usePolling: true },
      proxy: {
        '/api': { target: proxyTarget, changeOrigin: true },
        '/socket.io': { target: proxyTarget, ws: true },
      },
    },
  };
});
