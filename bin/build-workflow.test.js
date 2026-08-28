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
  // meta comes BEFORE the prompt-file content — the Workflow tool requires
  // `export const meta = {...}` to be the first statement in the script.
  assert.ok(result.indexOf('export const meta') < result.indexOf('const FOO'))
  assert.ok(result.indexOf('log(bar())') > result.indexOf('function bar'))
})

test('generateWorkflowScript puts meta as the first statement, even with a nested-brace phases array', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'agb-gen-'))
  const fileA = path.join(dir, 'a.js')
  const bodyFile = path.join(dir, 'body.js')
  await writeFile(fileA, 'export const FOO = 1\n')
  await writeFile(
    bodyFile,
    [
      '// leading comment that should be dropped, not required to survive',
      'export const meta = {',
      '  name: "x",',
      '  phases: [{ title: "A" }, { title: "B" }],',
      '}',
      '',
      'log(FOO)',
      '',
    ].join('\n')
  )

  const result = await generateWorkflowScript([fileA], bodyFile)

  // Strip the generator's own header comment before checking what the
  // first REAL statement is.
  const withoutHeader = result.replace(/^\/\/.*\n/gm, '').replace(/^\s+/, '')
  assert.match(withoutHeader, /^export const meta = \{/)
  assert.match(result, /phases: \[\{ title: "A" \}, \{ title: "B" \}\]/)
  assert.match(result, /^const FOO = 1/m)
  assert.match(result, /log\(FOO\)/)
  assert.ok(result.indexOf('const FOO') > result.indexOf('export const meta'))
})
