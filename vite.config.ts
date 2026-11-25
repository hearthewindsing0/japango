import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

/** Generated data the game loads; it lives on the server, not in git. */
const DATA = /^\/(tiles|dict|talk|life|trains|sounds|data|index)\//

/**
 * In `bun run dev`, data files that aren't in public/ come from the live
 * site, so the game runs without downloading anything first. Files built
 * or pulled into public/ (`bun run data:pull`) win. JAPANGO_DATA_URL picks
 * another site; set it to "off" to use only local files.
 */
function serverData(): Plugin {
  const site = (process.env.JAPANGO_DATA_URL || 'https://japango.hearthewindsing0.workers.dev').replace(/\/$/, '')
  return {
    name: 'japango-server-data',
    apply: 'serve',
    configureServer(server) {
      if (site === 'off') return
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url ?? '').split('?')[0]
        if (!DATA.test(path) || path.includes('..') || existsSync(resolve(server.config.publicDir, `.${decodeURIComponent(path)}`))) return next()
        try {
          const up = await fetch(`${site}${req.url}`)
          res.statusCode = up.status
          for (const h of ['content-type', 'cache-control', 'etag']) {
            const v = up.headers.get(h)
            if (v) res.setHeader(h, v)
          }
          res.end(Buffer.from(await up.arrayBuffer()))
        } catch (e) {
          server.config.logger.warn(`Couldn't get ${path} from ${site}: ${e}`)
          next()
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), serverData()],
  build: {
    rollupOptions: {
      // The game, the UI kit playground at /playground/, and art-direction
      // samples at /looks/.
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        playground: resolve(import.meta.dirname, 'playground/index.html'),
        looks: resolve(import.meta.dirname, 'looks/index.html'),
      },
    },
  },
})
