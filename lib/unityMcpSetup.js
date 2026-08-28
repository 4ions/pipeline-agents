import { createHash } from 'node:crypto'
import path from 'node:path'

// FunplayAI/funplay-unity-mcp derives its local HTTP server port from a
// SHA256 hash of the normalized project path (Editor/MCP/Server/FunplayProjectIdentity.cs).
// Reproduced here so .mcp.json can be pre-populated with the correct port
// without ever needing to query a running Unity Editor for it. This is
// case-preserving on macOS/Linux (only lowercased on Windows).
export function computeFunplayPort(projectPath) {
  const normalized = path.resolve(projectPath).replace(/[/\\]+$/, '').replace(/\\/g, '/')
  const hash = createHash('sha256').update(normalized, 'utf8').digest('hex')
  const value = parseInt(hash.slice(0, 8), 16)
  return 20000 + (value % 10000)
}

const COPLAYDEV_GIT_URL = 'https://github.com/CoplayDev/unity-mcp.git?path=/MCPForUnity#main'
const FUNPLAY_GIT_URL = 'https://github.com/FunplayAI/funplay-unity-mcp.git'

// Idempotently adds both Unity MCP package dependencies to a Packages/manifest.json
// object (parsed JSON, not a file path) and returns {manifest, changed}. Never
// overwrites an existing dependency entry for either key — if the project
// already depends on a different version/source, that's left alone.
export function addUnityMcpDependencies(manifest) {
  const deps = { ...(manifest.dependencies ?? {}) }
  let changed = false
  if (!('com.coplaydev.unity-mcp' in deps)) {
    deps['com.coplaydev.unity-mcp'] = COPLAYDEV_GIT_URL
    changed = true
  }
  // The package's own internal name (declared in its package.json) is
  // "com.gamebooom.unity.mcp", NOT "com.funplayai.unity-mcp" — Unity
  // Package Manager requires the manifest.json dependency key to match
  // that internal name exactly, or it refuses to resolve the package.
  if (!('com.gamebooom.unity.mcp' in deps)) {
    deps['com.gamebooom.unity.mcp'] = FUNPLAY_GIT_URL
    changed = true
  }
  return { manifest: { ...manifest, dependencies: deps }, changed }
}

// Builds the .mcp.json `mcpServers` entries for both packages. `coplayServerPath`
// is the absolute path to the resolved UnityMcpServer/src directory inside the
// target project (only discoverable after Unity has resolved the package once —
// pass null if not yet known, and the CoplayDev entry is omitted).
export function buildMcpServerConfig(targetProjectPath, coplayServerPath) {
  const mcpServers = {
    'funplay-unity': {
      type: 'http',
      url: `http://127.0.0.1:${computeFunplayPort(targetProjectPath)}/`,
    },
  }
  if (coplayServerPath) {
    mcpServers['unity-mcp'] = {
      command: 'uv',
      args: ['run', '--directory', coplayServerPath, 'server.py'],
    }
  }
  return { mcpServers }
}
