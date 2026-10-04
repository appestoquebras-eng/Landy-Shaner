import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { apiRouter } from './server/routes';
import { CONFIG } from './server/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();

  // Permite JSON no body (necessário para checkout e webhooks)
  app.use(express.json());

  // Rotas de API do backend
  app.use('/api', apiRouter);

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'landy-shaner-backend' });
  });

  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    // Modo Desenvolvimento: Monta o middleware do Vite
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Modo Produção: Serve o build estático gerado pelo Vite
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  const port = CONFIG.PORT || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`[Landy Shaner] Servidor rodando em http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Falha ao iniciar servidor:', err);
  process.exit(1);
});
