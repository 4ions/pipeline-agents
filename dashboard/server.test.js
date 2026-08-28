import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createServer } from './server.js'

async function withServer(pipelineParentDir, fn) {
  const server = createServer(pipelineParentDir)
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
    assert.deepEqual(body, { roles: {}, timeline: [] })
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
