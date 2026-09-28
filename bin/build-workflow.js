import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// The Workflow tool requires `export const meta = {...}` to be the FIRST
// statement in the script. Extract it from the body file (brace-counting,
// not a naive regex, since `phases` nests its own braces) so it can be
// emitted before the prompt-file content, with the rest of the body file
// following after — the prompt functions/consts are still declared before
// they're USED (function declarations are hoisted; the body's executable
// statements that reference prompt-file consts like VISION_SCHEMA only run
// after the whole script has finished evaluating its top-level bindings).
function extractMetaStatement(bodySource) {
  const startMatch = bodySource.match(/export const meta\s*=\s*\{/)
  if (!startMatch) {
    throw new Error('body file must contain "export const meta = {...}"')
  }
  const start = startMatch.index
  let depth = 0
  let end = -1
  for (let i = start; i < bodySource.length; i++) {
    const ch = bodySource[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        end = i + 1
        break
      }
    }
  }
  if (end === -1) {
    throw new Error('could not find the matching closing brace for "export const meta = {...}"')
  }
  return { metaStatement: bodySource.slice(start, end), rest: bodySource.slice(end) }
}

export async function generateWorkflowScript(promptFiles, bodyFile) {
  const promptSources = await Promise.all(promptFiles.map(f => readFile(f, 'utf8')))
  const strippedPrompts = promptSources.map(src => src.replace(/^export (function|const) /gm, '$1 '))
  const bodySource = await readFile(bodyFile, 'utf8')
  const { metaStatement, rest } = extractMetaStatement(bodySource)

  const header = `// GENERATED FILE — do not edit directly.
// Source: ${promptFiles.map(f => path.basename(f)).join(', ')} + ${path.basename(bodyFile)}
// Regenerate with: node bin/build-workflow.js
`
  return header + '\n' + metaStatement + '\n\n' + strippedPrompts.join('\n') + '\n' + rest
}

// CLI entrypoint: `node bin/build-workflow.js` regenerates every named
// workflow below from its prompt files + body file.
const CORE_PROMPT_FILES = ['schemas.js', 'mlTraining.js', 'director.js', 'designer.js', 'programmer.js', 'artist.js', 'tester.js', 'critic.js']

const WORKFLOWS = [
  { name: 'build-game', promptFiles: CORE_PROMPT_FILES },
  { name: 'fix-reopened', promptFiles: CORE_PROMPT_FILES },
  { name: 'milestone-build', promptFiles: [...CORE_PROMPT_FILES, 'roadmap.js'] },
  // Spike, deliberately self-contained — see prompts/ticketToUi.js header.
  { name: 'ticket-to-ui', promptFiles: ['ticketToUi.js'] },
]

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '')) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

  for (const { name, promptFiles } of WORKFLOWS) {
    const resolvedPromptFiles = promptFiles.map(f => path.join(root, 'prompts', f))
    const bodyFile = path.join(root, 'workflows', `${name}.body.js`)
    const outFile = path.join(root, 'workflows', `${name}.js`)

    const script = await generateWorkflowScript(resolvedPromptFiles, bodyFile)
    await writeFile(outFile, script, 'utf8')
    console.log(`Generated ${outFile}`)
  }
}
