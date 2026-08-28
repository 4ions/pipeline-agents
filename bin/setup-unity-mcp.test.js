import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setupUnityMcp } from './setup-unity-mcp.js'

test('setupUnityMcp writes both manifest deps and .mcp.json when nothing exists yet', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'agb-mcp-'))

  const result = await setupUnityMcp(dir)

  assert.equal(result.manifestChanged, true)
  assert.equal(result.coplayServerPath, null)

  const manifest = JSON.parse(await readFile(path.join(dir, 'Packages', 'manifest.json'), 'utf8'))
  assert.ok(manifest.dependencies['com.coplaydev.unity-mcp'])
  assert.ok(manifest.dependencies['com.funplayai.unity-mcp'])

  const mcpJson = JSON.parse(await readFile(path.join(dir, '.mcp.json'), 'utf8'))
  assert.ok(mcpJson.mcpServers['funplay-unity'].url.startsWith('http://127.0.0.1:'))
  assert.ok(!('unity-mcp' in mcpJson.mcpServers))
})

test('setupUnityMcp finds a resolved CoplayDev server and adds the unity-mcp entry', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'agb-mcp-'))
  const serverDir = path.join(dir, 'Library', 'PackageCache', 'com.coplaydev.unity-mcp@abc123', 'UnityMcpServer', 'src')
  await mkdir(serverDir, { recursive: true })
  await writeFile(path.join(serverDir, 'server.py'), '# stub\n')

  const result = await setupUnityMcp(dir)

  assert.equal(result.coplayServerPath, serverDir)
  const mcpJson = JSON.parse(await readFile(path.join(dir, '.mcp.json'), 'utf8'))
  assert.deepEqual(mcpJson.mcpServers['unity-mcp'], {
    command: 'uv',
    args: ['run', '--directory', serverDir, 'server.py'],
  })
})

test('setupUnityMcp preserves an existing manifest dependency and existing unrelated .mcp.json entries', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'agb-mcp-'))
  await mkdir(path.join(dir, 'Packages'), { recursive: true })
  await writeFile(
    path.join(dir, 'Packages', 'manifest.json'),
    JSON.stringify({ dependencies: { 'com.unity.2d.sprite': '1.0.0' } })
  )
  await writeFile(path.join(dir, '.mcp.json'), JSON.stringify({ mcpServers: { 'some-other-server': { type: 'http', url: 'http://x' } } }))

  const result = await setupUnityMcp(dir)

  assert.equal(result.manifestChanged, true)
  const manifest = JSON.parse(await readFile(path.join(dir, 'Packages', 'manifest.json'), 'utf8'))
  assert.equal(manifest.dependencies['com.unity.2d.sprite'], '1.0.0')
  assert.ok(manifest.dependencies['com.coplaydev.unity-mcp'])

  const mcpJson = JSON.parse(await readFile(path.join(dir, '.mcp.json'), 'utf8'))
  assert.ok(mcpJson.mcpServers['some-other-server'])
  assert.ok(mcpJson.mcpServers['funplay-unity'])
})

test('setupUnityMcp is idempotent on a second run', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'agb-mcp-'))
  await setupUnityMcp(dir)
  const second = await setupUnityMcp(dir)
  assert.equal(second.manifestChanged, false)
})
