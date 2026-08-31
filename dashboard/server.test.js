import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from './server.js'

async function withServer(pipelineParentDir, fn, publicDir) {
  const server = createServer(pipelineParentDir, publicDir)
  await new Promise(resolve => server.listen(0, resolve))
  const { port } = server.address()
  try {
    await fn(`http://127.0.0.1:${port}`)
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}

test('GET /api/state returns empty state when no activity log exists yet', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'agb-dash-'))
  await withServer(dir, async (base) => {
    const res = await fetch(`${base}/api/state`)
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.deepEqual(body, { roles: {}, timeline: [], backlog: null })
  })
})

test('GET /api/state includes backlog.json contents when present', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'agb-dash-'))
  await mkdir(path.join(dir, '.pipeline'), { recursive: true })
  const backlog = [{ id: 'T1', specialization: 'gameplay', description: 'x', successCriterion: 'y', needsArt: false, needsAnimation: false, status: 'done', attempts: 1 }]
  await writeFile(path.join(dir, '.pipeline', 'backlog.json'), JSON.stringify(backlog))
  await withServer(dir, async (base) => {
    const res = await fetch(`${base}/api/state`)
    const body = await res.json()
    assert.deepEqual(body.backlog, backlog)
  })
})

test('GET /api/state reflects the current activity log contents', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'agb-dash-'))
  await mkdir(path.join(dir, '.pipeline'), { recursive: true })
  await writeFile(
    path.join(dir, '.pipeline', 'activity.log.jsonl'),
    '{"ts":"2026-08-27T10:00:00Z","role":"director","specialization":null,"taskId":null,"event":"start","detail":"Writing vision"}\n'
  )
  await withServer(dir, async (base) => {
    const res = await fetch(`${base}/api/state`)
    const body = await res.json()
    assert.equal(body.roles.director.status, 'working')
  })
})

test('GET / serves the static dashboard index page', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'agb-dash-'))
  await withServer(dir, async (base) => {
    const res = await fetch(`${base}/`)
    assert.equal(res.status, 200)
    const body = await res.text()
    assert.match(body, /<html/i)
  })
})

test('path traversal via .. in request URL is blocked', async () => {
  const baseDir = await mkdtemp(path.join(tmpdir(), 'agb-path-test-'))
  const publicDir = path.join(baseDir, 'public')
  const secretDir = path.join(baseDir, 'public-assets')

  await mkdir(publicDir)
  await mkdir(secretDir)
  await writeFile(path.join(publicDir, 'index.html'), '<html></html>')
  await writeFile(path.join(secretDir, 'secret.txt'), 'secret')

  await withServer(baseDir, async (base) => {
    // Attempt to escape public/ via ../ to access sibling public-assets/
    const res = await fetch(`${base}/../public-assets/secret.txt`)
    // Should return 403 Forbidden or 404 Not Found, not 200 OK
    assert.notEqual(res.status, 200)
  }, publicDir)
})
