import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { existsSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/**
 * Serves the Vercel Functions in /api during `npm run dev`, so local development
 * talks to the same endpoints (and database) as production.
 */
function vercelApiDev(): Plugin {
  return {
    name: 'vercel-api-dev',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '')
      for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()
        const route = req.url.slice(5).split('?')[0]!
        if (!/^[a-z-]+$/.test(route) || !existsSync(`${process.cwd()}/api/${route}.ts`)) {
          res.statusCode = 404
          return res.end()
        }
        try {
          const mod = (await server.ssrLoadModule(`/api/${route}.ts`)) as Record<string, (r: Request) => Promise<Response>>
          const fn = mod[req.method ?? 'GET']
          if (!fn) {
            res.statusCode = 405
            return res.end()
          }
          const chunks: Buffer[] = []
          if (req.method !== 'GET' && req.method !== 'HEAD') for await (const c of req) chunks.push(c as Buffer)
          const headers = new Headers()
          for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
          const request = new Request(`http://${req.headers.host}${req.url}`, {
            method: req.method,
            headers,
            body: chunks.length ? Buffer.concat(chunks) : undefined,
          })
          const response = await fn(request)
          res.statusCode = response.status
          response.headers.forEach((v, k) => res.setHeader(k, v))
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (e) {
          server.config.logger.error(`[api] ${route}: ${(e as Error).stack ?? e}`)
          res.statusCode = 500
          res.end(JSON.stringify({ error: 'Internal error' }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), vercelApiDev()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
})
