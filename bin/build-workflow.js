import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export async function generateWorkflowScript(promptFiles, bodyFile) {
  const promptSources = await Promise.all(promptFiles.map(f => readFile(f, 'utf8')))
  const strippedPrompts = promptSources.map(src => src.replace(/^export (function|const) /gm, '$1 '))
  const bodySource = await readFile(bodyFile, 'utf8')

  const header = `// GENERATED FILE — do not edit directly.
// Source: ${promptFiles.map(f => path.basename(f)).join(', ')} + ${path.basename(bodyFile)}
// Regenerate with: node bin/build-workflow.js
`
  return header + '\n' + strippedPrompts.join('\n') + '\n' + bodySource
}

// CLI entrypoint: `node bin/build-workflow.js`
if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '')) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const promptFiles = ['schemas.js', 'director.js', 'designer.js', 'programmer.js', 'artist.js', 'tester.js']
    .map(name => path.join(root, 'prompts', name))
  const bodyFile = path.join(root, 'workflows', 'build-game.body.js')
  const outFile = path.join(root, 'workflows', 'build-game.js')

  const script = await generateWorkflowScript(promptFiles, bodyFile)
  await writeFile(outFile, script, 'utf8')
  console.log(`Generated ${outFile}`)
}
