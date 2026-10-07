/**
 * Download and pin rembg isnet-general-use.onnx into models/ + public/models/.
 * Verifies MD5 (rembg) and prints SHA-256.
 */
import { createHash } from 'node:crypto'
import { createWriteStream, copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const url =
  'https://github.com/danielgatis/rembg/releases/download/v0.0.0/isnet-general-use.onnx'
const expectedMd5 = 'FC16EBD8B0C10D971D3513D564D01E29'
const out = join(root, 'models', 'isnet-general-use.onnx')
const pub = join(root, 'public', 'models', 'isnet-general-use.onnx')

mkdirSync(dirname(out), { recursive: true })
mkdirSync(dirname(pub), { recursive: true })

console.log('Downloading', url)
const res = await fetch(url)
if (!res.ok || !res.body) {
  console.error('Download failed', res.status)
  process.exit(1)
}
await pipeline(res.body, createWriteStream(out))

const buf = readFileSync(out)
const md5 = createHash('md5').update(buf).digest('hex').toUpperCase()
const sha = createHash('sha256').update(buf).digest('hex').toUpperCase()
console.log('Size', buf.length)
console.log('MD5', md5)
console.log('SHA256', sha)
if (md5 !== expectedMd5) {
  console.error('MD5 mismatch — expected', expectedMd5)
  process.exit(1)
}
copyFileSync(out, pub)
console.log('Copied to', pub)
