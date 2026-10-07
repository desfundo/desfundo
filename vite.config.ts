import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * onnxruntime-web (inside IMG.LY) makes Vite emit its 24 MB JSEP wasm, but IMG.LY
 * always overrides `wasmPaths` with the copy in public/imgly/, so it is never loaded.
 */
function dropUnusedOrtWasm(): Plugin {
  return {
    name: 'drop-unused-ort-wasm',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const name of Object.keys(bundle)) {
        if (/ort-wasm-simd-threaded\.jsep-.*\.wasm$/.test(name)) delete bundle[name]
      }
    },
  }
}

function crossOriginIsolation() {
  return {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  }
}

export default defineConfig({
  // Required so Electron can load assets from file:// after packaging.
  base: './',
  plugins: [react(), dropUnusedOrtWasm()],
  optimizeDeps: {
    exclude: ['@imgly/background-removal'],
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // Same isolation as the Electron app:// protocol, so ONNX gets its threads in dev too.
    headers: crossOriginIsolation(),
  },
  preview: {
    headers: crossOriginIsolation(),
  },
  worker: {
    format: 'es',
  },
})
