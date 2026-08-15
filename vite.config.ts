import { defineConfig, type Plugin, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'

function resolveAppVersionId(): string {
  return process.env.COMMIT_REF || process.env.BUILD_ID || 'dev'
}

function appVersionPlugin(id: string): Plugin {
  const payload = JSON.stringify({ id })
  return {
    name: 'yahpaz-app-version',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: payload,
      })
    },
    configureServer(server: ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0]
        if (path !== '/version.json') {
          next()
          return
        }
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        res.end(payload)
      })
    },
  }
}

const appVersionId = resolveAppVersionId()

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), appVersionPlugin(appVersionId)],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersionId),
  },
})
