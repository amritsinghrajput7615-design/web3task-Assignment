import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { ProxyOptions } from 'vite';

/** Benign when clients refresh, HMR reloads, or the backend restarts mid-connection. */
function isBenignProxySocketError(err: NodeJS.ErrnoException) {
  const code = err.code ?? '';
  return code === 'ECONNABORTED' || code === 'ECONNRESET' || code === 'EPIPE';
}

const socketIoProxy: ProxyOptions = {
  target: 'http://localhost:3001',
  ws: true,
  changeOrigin: true,
  configure: (proxy) => {
    proxy.on('error', (err, _req, res) => {
      if (isBenignProxySocketError(err)) return;
      if (res && 'writeHead' in res && !res.headersSent) {
        res.writeHead(502);
        res.end();
      }
      console.error('[vite] /socket.io proxy error:', err.message);
    });
    proxy.on('proxyReqWs', (_proxyReq, _req, socket) => {
      socket.on('error', (err: NodeJS.ErrnoException) => {
        if (!isBenignProxySocketError(err)) {
          console.error('[vite] ws proxy socket error:', err.message);
        }
      });
    });
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/socket.io': socketIoProxy,
    },
  },
});
