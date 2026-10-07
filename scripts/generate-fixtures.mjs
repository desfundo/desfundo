/**
 * Generate synthetic product-like PNG fixtures for engine A/B (no personal photos).
 * Origin: procedurally generated for Desfundo benchmark — CC0 / public domain intent.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'public', 'fixtures')

function fill(png, r, g, b) {
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (png.width * y + x) << 2
      png.data[i] = r
      png.data[i + 1] = g
      png.data[i + 2] = b
      png.data[i + 3] = 255
    }
  }
}

function rect(png, x0, y0, w, h, r, g, b, a = 255) {
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      if (x < 0 || y < 0 || x >= png.width || y >= png.height) continue
      const i = (png.width * y + x) << 2
      png.data[i] = r
      png.data[i + 1] = g
      png.data[i + 2] = b
      png.data[i + 3] = a
    }
  }
}

function ellipse(png, cx, cy, rx, ry, r, g, b, a = 255) {
  for (let y = cy - ry; y <= cy + ry; y++) {
    for (let x = cx - rx; x <= cx + rx; x++) {
      const dx = (x - cx) / rx
      const dy = (y - cy) / ry
      if (dx * dx + dy * dy <= 1) {
        if (x < 0 || y < 0 || x >= png.width || y >= png.height) continue
        const i = (png.width * y + x) << 2
        png.data[i] = r
        png.data[i + 1] = g
        png.data[i + 2] = b
        png.data[i + 3] = a
      }
    }
  }
}

function write(name, build) {
  const png = new PNG({ width: 512, height: 512 })
  build(png)
  const buf = PNG.sync.write(png)
  writeFileSync(join(outDir, name), buf)
  console.log('wrote', name, buf.length)
}

mkdirSync(outDir, { recursive: true })

const fixtures = [
  [
    '01-plastic-packaging.png',
    (p) => {
      fill(p, 210, 225, 235)
      rect(p, 140, 120, 230, 280, 40, 160, 200)
      rect(p, 160, 150, 190, 40, 200, 240, 255, 180)
    },
  ],
  [
    '02-reflective-packaging.png',
    (p) => {
      fill(p, 40, 40, 48)
      rect(p, 150, 100, 220, 300, 180, 180, 190)
      for (let i = 0; i < 8; i++) {
        rect(p, 160 + i * 20, 110, 8, 280, 240, 240, 255, 120)
      }
    },
  ],
  [
    '03-bottle.png',
    (p) => {
      fill(p, 230, 240, 250)
      ellipse(p, 256, 380, 70, 40, 30, 120, 80)
      rect(p, 210, 160, 90, 220, 30, 140, 90)
      ellipse(p, 256, 160, 45, 30, 30, 140, 90)
      rect(p, 235, 100, 40, 70, 200, 200, 210)
    },
  ],
  [
    '04-jar.png',
    (p) => {
      fill(p, 245, 240, 230)
      ellipse(p, 256, 360, 110, 50, 200, 80, 60)
      rect(p, 150, 180, 210, 180, 200, 80, 60)
      ellipse(p, 256, 180, 105, 40, 220, 200, 180)
      rect(p, 180, 200, 150, 80, 255, 240, 200)
    },
  ],
  [
    '05-box.png',
    (p) => {
      fill(p, 180, 200, 160)
      rect(p, 120, 140, 260, 240, 160, 60, 40)
      rect(p, 120, 140, 260, 40, 200, 90, 60)
      rect(p, 200, 220, 100, 60, 255, 255, 255)
    },
  ],
  [
    '06-label-text.png',
    (p) => {
      fill(p, 220, 220, 230)
      rect(p, 160, 100, 200, 320, 250, 250, 252)
      rect(p, 180, 160, 160, 30, 20, 20, 20)
      rect(p, 180, 210, 120, 20, 20, 20, 20)
      rect(p, 180, 250, 140, 20, 20, 20, 20)
    },
  ],
  [
    '07-thin-edges.png',
    (p) => {
      fill(p, 90, 120, 90)
      for (let i = 0; i < 12; i++) {
        rect(p, 80 + i * 30, 80, 4, 350, 240, 240, 240)
      }
      ellipse(p, 256, 256, 60, 60, 200, 200, 40)
    },
  ],
  [
    '08-transparent-area.png',
    (p) => {
      fill(p, 200, 210, 220)
      rect(p, 140, 120, 230, 280, 100, 180, 220, 120)
      rect(p, 180, 180, 150, 160, 255, 255, 255, 80)
      ellipse(p, 256, 260, 40, 80, 40, 100, 160, 200)
    },
  ],
  [
    '09-strong-shadow.png',
    (p) => {
      fill(p, 240, 240, 245)
      ellipse(p, 300, 360, 120, 40, 120, 120, 130)
      rect(p, 180, 140, 160, 200, 220, 60, 50)
    },
  ],
  [
    '10-difficult-background.png',
    (p) => {
      for (let y = 0; y < 512; y++) {
        for (let x = 0; x < 512; x++) {
          const i = (512 * y + x) << 2
          p.data[i] = (x * 3 + y) % 255
          p.data[i + 1] = (y * 5) % 255
          p.data[i + 2] = (x * 7 + 40) % 255
          p.data[i + 3] = 255
        }
      }
      rect(p, 180, 150, 150, 220, 250, 250, 250)
      ellipse(p, 255, 200, 50, 50, 30, 30, 30)
    },
  ],
]

for (const [name, build] of fixtures) write(name, build)

writeFileSync(
  join(outDir, 'manifest.json'),
  JSON.stringify(
    {
      generated: new Date().toISOString(),
      license: 'Synthetic fixtures generated for Desfundo A/B — no personal photos. Treat as CC0.',
      files: fixtures.map(([n]) => n),
    },
    null,
    2,
  ),
)
console.log('fixtures ready in', outDir)
