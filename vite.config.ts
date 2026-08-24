import fs from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { defineConfig, type Connect, type Plugin, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'

function resolveAppVersionId(): string {
  return process.env.COMMIT_REF || process.env.BUILD_ID || 'dev'
}

function partnerApiDocsPlugin(): Plugin {
  const sendIndex = (res: ServerResponse) => {
    const html = fs.readFileSync(path.join(process.cwd(), 'public/partner-api/index.html'), 'utf8')
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.end(html)
  }
  const middleware: Connect.NextHandleFunction = (
    req: IncomingMessage,
    res: ServerResponse,
    next,
  ) => {
    const urlPath = req.url?.split('?')[0]
    if (urlPath === '/partner-api') {
      res.writeHead(301, { Location: '/partner-api/' })
      res.end()
      return
    }
    if (urlPath === '/partner-api/') {
      sendIndex(res)
      return
    }
    next()
  }
  return {
    name: 'yahpaz-partner-api-docs',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
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
        const urlPath = req.url?.split('?')[0]
        if (urlPath !== '/version.json') {
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
  plugins: [react(), partnerApiDocsPlugin(), appVersionPlugin(appVersionId)],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersionId),
  },
})
