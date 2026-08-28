import { mkdir, writeFile, access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const INITIAL_FILES = {
  'vision.md': '# Vision\n\n(not yet generated)\n',
  'gdd.md': '# Game Design Document\n\n(not yet generated)\n',
  'backlog.json': '[]\n',
  'bugs.json': '[]\n',
  'activity.log.jsonl': '',
  'progress-log.md': '# Progress Log\n\n',
}

export async function scaffoldPipeline(targetDir) {
  const pipelineDir = path.join(targetDir, '.pipeline')
  await mkdir(pipelineDir, { recursive: true })

  const created = []
  for (const [name, contents] of Object.entries(INITIAL_FILES)) {
    const filePath = path.join(pipelineDir, name)
    try {
      await access(filePath)
    } catch {
      await writeFile(filePath, contents, 'utf8')
      created.push(name)
    }
  }
  return { created }
}

// CLI entrypoint: `node bin/init-pipeline.js <target-project-dir>`
if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '')) {
  const target = process.argv[2]
  if (!target) {
    console.error('Usage: node bin/init-pipeline.js <target-unity-project-dir>')
    process.exit(1)
  }
  const { created } = await scaffoldPipeline(path.resolve(target))
  console.log(created.length ? `Created: ${created.join(', ')}` : 'Pipeline state already exists, nothing to do.')
}
