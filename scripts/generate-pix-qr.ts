/**
 * Regenerates public/pix-qr.svg from PIX in src/config/project.ts.
 * Run after changing the Pix key: npm run pix:qr
 */
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import QRCode from 'qrcode'
import { PIX } from '../src/config/project'
import { buildPixPayload } from '../src/lib/pix'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const payload = buildPixPayload(PIX)
const svg = await QRCode.toString(payload, {
  type: 'svg',
  errorCorrectionLevel: 'M',
  margin: 2,
  color: { dark: '#000000', light: '#ffffff' },
})
writeFileSync(join(root, 'public', 'pix-qr.svg'), svg)
console.log('public/pix-qr.svg gerado para', payload)
