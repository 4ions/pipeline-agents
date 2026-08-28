import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { generateWorkflowScript } from './build-workflow.js'

test('generateWorkflowScript strips export keywords and concatenates in order', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'agb-gen-'))
  const fileA = path.join(dir, 'a.js')
  const fileB = path.join(dir, 'b.js')
  const bodyFile = path.join(dir, 'body.js')
  await writeFile(fileA, 'export const FOO = 1\n')
  await writeFile(fileB, 'export function bar() { return FOO }\n')
  await writeFile(bodyFile, 'export const meta = { name: "x", description: "y" }\nlog(bar())\n')

  const result = await generateWorkflowScript([fileA, fileB], bodyFile)

  assert.doesNotMatch(result, /export const FOO/)
  assert.doesNotMatch(result, /export function bar/)
  assert.match(result, /^const FOO = 1/m)
  assert.match(result, /^function bar\(\) \{ return FOO \}/m)
  assert.match(result, /export const meta = /)
  assert.ok(result.indexOf('const FOO') < result.indexOf('function bar'))
  assert.ok(result.indexOf('function bar') < result.indexOf('export const meta'))
})
