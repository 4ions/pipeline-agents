import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { scaffoldPipeline } from './init-pipeline.js'

test('scaffoldPipeline creates all expected files with valid initial content', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'agb-'))
  const result = await scaffoldPipeline(dir)

  assert.equal(result.created.length, 6)

  const backlog = JSON.parse(await readFile(path.join(dir, '.pipeline', 'backlog.json'), 'utf8'))
  assert.deepEqual(backlog, [])

  const bugs = JSON.parse(await readFile(path.join(dir, '.pipeline', 'bugs.json'), 'utf8'))
  assert.deepEqual(bugs, [])

  const activityLog = await readFile(path.join(dir, '.pipeline', 'activity.log.jsonl'), 'utf8')
  assert.equal(activityLog, '')

  const vision = await readFile(path.join(dir, '.pipeline', 'vision.md'), 'utf8')
  assert.match(vision, /^# Vision/)
})

test('scaffoldPipeline does not overwrite existing state on a second run', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'agb-'))
  await scaffoldPipeline(dir)
  await mkdir(path.join(dir, '.pipeline'), { recursive: true })
  await writeFile(path.join(dir, '.pipeline', 'backlog.json'), JSON.stringify([{ id: 'keep-me' }]))

  const result = await scaffoldPipeline(dir)
  assert.deepEqual(result.created, [])

  const backlog = JSON.parse(await readFile(path.join(dir, '.pipeline', 'backlog.json'), 'utf8'))
  assert.deepEqual(backlog, [{ id: 'keep-me' }])
})
