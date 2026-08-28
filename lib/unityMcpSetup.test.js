import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeFunplayPort, addUnityMcpDependencies, buildMcpServerConfig } from './unityMcpSetup.js'

test('computeFunplayPort matches the SHA256-derived formula for a known path', () => {
  // Verified independently in Python: sha256("/Users/leovalsan/Unity/Dungeon Dash")
  // -> first 8 hex chars as int, mod 10000, + 20000 == 22141.
  assert.equal(computeFunplayPort('/Users/leovalsan/Unity/Dungeon Dash'), 22141)
})

test('computeFunplayPort is stable regardless of a trailing slash', () => {
  assert.equal(
    computeFunplayPort('/Users/leovalsan/Unity/Dungeon Dash'),
    computeFunplayPort('/Users/leovalsan/Unity/Dungeon Dash/')
  )
})

test('computeFunplayPort stays within the 20000-29999 range', () => {
  for (const p of ['/a', '/b/c/d', '/very/long/path/to/a/unity/project', '/']) {
    const port = computeFunplayPort(p)
    assert.ok(port >= 20000 && port <= 29999, `port ${port} out of range for ${p}`)
  }
})

test('addUnityMcpDependencies adds both packages to an empty manifest', () => {
  const { manifest, changed } = addUnityMcpDependencies({ dependencies: {} })
  assert.equal(changed, true)
  assert.ok(manifest.dependencies['com.coplaydev.unity-mcp'].includes('CoplayDev/unity-mcp'))
  assert.ok(manifest.dependencies['com.funplayai.unity-mcp'].includes('FunplayAI/funplay-unity-mcp'))
})

test('addUnityMcpDependencies is idempotent and never overwrites an existing entry', () => {
  const first = addUnityMcpDependencies({ dependencies: { 'com.unity.2d.sprite': '1.0.0' } })
  const second = addUnityMcpDependencies(first.manifest)
  assert.equal(second.changed, false)
  assert.deepEqual(second.manifest, first.manifest)

  const pinned = addUnityMcpDependencies({
    dependencies: { 'com.coplaydev.unity-mcp': 'some-pinned-fork-url' },
  })
  assert.equal(pinned.manifest.dependencies['com.coplaydev.unity-mcp'], 'some-pinned-fork-url')
})

test('addUnityMcpDependencies preserves existing unrelated dependencies', () => {
  const { manifest } = addUnityMcpDependencies({ dependencies: { 'com.unity.2d.sprite': '1.0.0' } })
  assert.equal(manifest.dependencies['com.unity.2d.sprite'], '1.0.0')
})

test('buildMcpServerConfig always includes the funplay HTTP entry with the correct port', () => {
  const config = buildMcpServerConfig('/Users/leovalsan/Unity/Dungeon Dash', null)
  assert.deepEqual(config.mcpServers['funplay-unity'], { type: 'http', url: 'http://127.0.0.1:22141/' })
  assert.ok(!('unity-mcp' in config.mcpServers))
})

test('buildMcpServerConfig includes the coplaydev entry only when a server path is known', () => {
  const config = buildMcpServerConfig('/Users/leovalsan/Unity/Dungeon Dash', '/path/to/UnityMcpServer/src')
  assert.deepEqual(config.mcpServers['unity-mcp'], {
    command: 'uv',
    args: ['run', '--directory', '/path/to/UnityMcpServer/src', 'server.py'],
  })
})
