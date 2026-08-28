import http from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseActivityLog, reduceToState } from '../lib/activityLog.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_PUBLIC_DIR = path.join(__dirname, 'public')
const CONTENT_TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }

export function createServer(pipelineParentDir, publicDir = DEFAULT_PUBLIC_DIR) {
  const PUBLIC_DIR = publicDir
  return http.createServer(async (req, res) => {
    if (req.url === '/api/state') {
      let events = []
      try {
        const text = await readFile(path.join(pipelineParentDir, '.pipeline', 'activity.log.jsonl'), 'utf8')
        events = parseActivityLog(text)
      } catch {
        // no log yet — return empty state
      }
      const body = JSON.stringify(reduceToState(events))
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(body)
      return
    }

    const reqPath = req.url === '/' ? '/index.html' : req.url
    const filePath = path.join(PUBLIC_DIR, reqPath)
    if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
      res.writeHead(403)
      res.end('Forbidden')
      return
    }
    try {
      const contents = await readFile(filePath)
      const ext = path.extname(filePath)
      // No caching — this dashboard is actively edited while running, and
      // a stale cached CSS/JS file makes live edits look like they never
      // took effect.
      res.writeHead(200, { 'Content-Type': CONTENT_TYPES[ext] ?? 'application/octet-stream', 'Cache-Control': 'no-store' })
      res.end(contents)
    } catch {
      res.writeHead(404)
      res.end('Not found')
    }
  })
}

// CLI entrypoint: `node dashboard/server.js <target-unity-project-dir> [port]`
if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '')) {
  const target = process.argv[2]
  const port = Number(process.argv[3] ?? 4173)
  if (!target) {
    console.error('Usage: node dashboard/server.js <target-unity-project-dir> [port]')
    process.exit(1)
  }
  const server = createServer(path.resolve(target))
  server.listen(port, '127.0.0.1', () => console.log(`Dashboard running at http://localhost:${port}`))
}
