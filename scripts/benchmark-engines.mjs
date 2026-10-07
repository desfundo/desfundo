/**
 * Start Vite and print the autorun URL. The browser harness writes
 * benchmark/results.json via /__benchmark_save when Run completes.
 *
 * Usage:
 *   npm run benchmark:engines
 *   node scripts/benchmark-engines.mjs --provider=webgpu
 */
import { spawn } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const args = process.argv.slice(2)
const providerArg = args.find((a) => a.startsWith('--provider='))
const provider = providerArg?.split('=')[1] ?? 'wasm'
const port = '5173'
const url = `http://localhost:${port}/benchmark.html?autorun=1&provider=${provider}`

console.log('Generating fixtures…')
await new Promise((resolve, reject) => {
  const p = spawn(process.execPath, ['scripts/generate-fixtures.mjs'], {
    cwd: root,
    stdio: 'inherit',
  })
  p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('fixtures failed'))))
})

console.log(`Starting Vite → ${url}`)
console.log('When finished, check benchmark/results.json and benchmark/{imgly,isnet}/')

const vite = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vite', '--host', 'localhost', '--port', port, '--strictPort', '--open', url],
  { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' },
)

vite.on('exit', (code) => process.exit(code ?? 0))
