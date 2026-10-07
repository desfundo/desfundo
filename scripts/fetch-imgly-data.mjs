/**
 * Mirror the IMG.LY background-removal data (AGPL-3.0) into public/imgly/ so the
 * app runs offline instead of fetching the model from staticimgly.com at runtime.
 * Only the CPU runtime and the model the app uses are copied. Chunk hashes are verified.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const VERSION = '1.7.0'
const KEYS = [
  '/onnxruntime-web/ort-wasm-simd-threaded.wasm',
  '/onnxruntime-web/ort-wasm-simd-threaded.mjs',
  '/models/isnet_fp16',
]

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'public', 'imgly')
const base = `https://staticimgly.com/@imgly/background-removal-data/${VERSION}/dist/`

mkdirSync(outDir, { recursive: true })

// Already mirrored and intact → no network needed (offline builds keep working).
const localIndex = join(outDir, 'resources.json')
if (existsSync(localIndex)) {
  const local = JSON.parse(readFileSync(localIndex, 'utf8'))
  const intact = KEYS.every((key) =>
    local[key]?.chunks.every((c) => {
      const file = join(outDir, c.name)
      return existsSync(file) && sha256(readFileSync(file)) === c.hash
    }),
  )
  if (intact) {
    console.log('IMG.LY data já presente e verificado em', outDir)
    process.exit(0)
  }
}

const res = await fetch(base + 'resources.json')
if (!res.ok) throw new Error(`resources.json: HTTP ${res.status}`)
const all = await res.json()

const subset = {}
for (const key of KEYS) {
  const entry = all[key]
  if (!entry) throw new Error(`Recurso ausente no CDN: ${key}`)
  subset[key] = entry
  for (const chunk of entry.chunks) {
    const file = join(outDir, chunk.name)
    if (existsSync(file) && sha256(readFileSync(file)) === chunk.hash) continue
    const r = await fetch(base + chunk.name)
    if (!r.ok) throw new Error(`${chunk.name}: HTTP ${r.status}`)
    const buf = Buffer.from(await r.arrayBuffer())
    if (sha256(buf) !== chunk.hash) throw new Error(`Hash inválido: ${chunk.name}`)
    writeFileSync(file, buf)
  }
  console.log('ok', key, `${(entry.size / 1e6).toFixed(1)} MB`)
}

writeFileSync(join(outDir, 'resources.json'), JSON.stringify(subset, null, 2))
const license = await fetch(`https://staticimgly.com/@imgly/background-removal-data/${VERSION}/LICENSE.md`)
if (license.ok) writeFileSync(join(outDir, 'LICENSE.md'), await license.text())
console.log('IMG.LY data pronto em', outDir)

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex')
}
