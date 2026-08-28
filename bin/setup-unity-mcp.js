import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { addUnityMcpDependencies, buildMcpServerConfig } from '../lib/unityMcpSetup.js'

async function readJsonIfExists(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch {
    return fallback
  }
}

// Recursively finds a directory containing `server.py` under a `UnityMcpServer/src`
// path, bounded to a sane depth (package caches are never deeply nested beyond this).
async function findServerPyDir(dir, depthRemaining) {
  if (depthRemaining <= 0) return null
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return null
  }
  if (
    path.basename(dir) === 'src' &&
    path.basename(path.dirname(dir)) === 'UnityMcpServer' &&
    entries.some(e => e.isFile() && e.name === 'server.py')
  ) {
    return dir
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const found = await findServerPyDir(path.join(dir, entry.name), depthRemaining - 1)
    if (found) return found
  }
  return null
}

// Searches for the CoplayDev package's resolved server directory — only
// present once Unity has opened this project at least once and resolved
// the package (Library/PackageCache) or embedded it (Packages/).
async function findCoplayServerPath(targetProjectPath) {
  for (const root of ['Library/PackageCache', 'Packages']) {
    const found = await findServerPyDir(path.join(targetProjectPath, root), 6)
    if (found) return found
  }
  return null
}

export async function setupUnityMcp(targetProjectPath) {
  const manifestPath = path.join(targetProjectPath, 'Packages', 'manifest.json')
  const manifest = await readJsonIfExists(manifestPath, { dependencies: {} })
  const { manifest: updatedManifest, changed } = addUnityMcpDependencies(manifest)

  if (changed) {
    await mkdir(path.dirname(manifestPath), { recursive: true })
    await writeFile(manifestPath, JSON.stringify(updatedManifest, null, 2) + '\n', 'utf8')
  }

  const coplayServerPath = await findCoplayServerPath(targetProjectPath)
  const config = buildMcpServerConfig(targetProjectPath, coplayServerPath)

  const mcpJsonPath = path.join(targetProjectPath, '.mcp.json')
  const existingMcpJson = await readJsonIfExists(mcpJsonPath, { mcpServers: {} })
  const mergedMcpServers = { ...existingMcpJson.mcpServers, ...config.mcpServers }
  await writeFile(
    mcpJsonPath,
    JSON.stringify({ ...existingMcpJson, mcpServers: mergedMcpServers }, null, 2) + '\n',
    'utf8'
  )

  return { manifestChanged: changed, coplayServerPath, mcpJsonPath }
}

// CLI entrypoint: `node bin/setup-unity-mcp.js <target-unity-project-dir>`
if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '')) {
  const target = process.argv[2]
  if (!target) {
    console.error('Usage: node bin/setup-unity-mcp.js <target-unity-project-dir>')
    process.exit(1)
  }
  const resolvedTarget = path.resolve(target)
  const { manifestChanged, coplayServerPath, mcpJsonPath } = await setupUnityMcp(resolvedTarget)

  if (manifestChanged) {
    console.log(`Added com.coplaydev.unity-mcp and com.gamebooom.unity.mcp to ${resolvedTarget}/Packages/manifest.json`)
  } else {
    console.log('Packages/manifest.json already has both dependencies — left unchanged.')
  }

  console.log(`Wrote ${mcpJsonPath}`)
  console.log(`  funplay-unity: computed HTTP port (no Unity Editor needed to know it)`)
  console.log(
    coplayServerPath
      ? `  unity-mcp: found resolved server at ${coplayServerPath}`
      : '  unity-mcp: NOT configured yet — UnityMcpServer/src/server.py not found under Library/PackageCache or Packages.'
  )

  console.log(`
Remaining manual steps (cannot be scripted — see docs/superpowers/plans research):
1. Open "${resolvedTarget}" in the Unity Editor once and let it finish
   compiling, so the CoplayDev package resolves.${coplayServerPath ? '' : ' (needed before unity-mcp works — re-run this script after.)'}
2. Every time you open this project's Editor, open the Funplay window and
   toggle "Enable MCP Server" on — by design this package never auto-starts
   or persists that toggle between Editor sessions.
`)
}
