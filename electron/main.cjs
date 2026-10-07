const { app, BrowserWindow, net, protocol, shell } = require('electron')
const path = require('path')
const { pathToFileURL } = require('url')

/** Desktop shell for Desfundo. No accounts, no paywall, no network needed. */

const DIST = path.join(__dirname, '..', 'dist')
const APP_ORIGIN = 'app://desfundo'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
}

// Served from a custom scheme (not file://) so we can send COOP/COEP headers:
// cross-origin isolation enables SharedArrayBuffer, which ONNX needs for
// multi-threaded inference. Over file:// it silently falls back to 1 thread.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
])

function registerAppProtocol() {
  protocol.handle('app', async (request) => {
    const { pathname } = new URL(request.url)
    const file = path.normalize(path.join(DIST, decodeURIComponent(pathname)))
    if (!file.startsWith(DIST)) return new Response('Forbidden', { status: 403 })

    const target = pathname === '/' ? path.join(DIST, 'index.html') : file
    const res = await net.fetch(pathToFileURL(target).toString())
    if (!res.ok) return new Response('Not found', { status: 404 })
    return new Response(res.body, {
      status: 200,
      headers: {
        'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Cross-Origin-Resource-Policy': 'same-origin',
      },
    })
  })
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: 'Desfundo',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  // Dropping a file outside the drop zone would navigate the window to it and
  // wipe the whole session. Never leave the app page.
  const appUrl = app.isPackaged
    ? `${APP_ORIGIN}/index.html`
    : process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173'
  win.webContents.on('will-navigate', (event, url) => {
    if (new URL(url).origin !== new URL(appUrl).origin) event.preventDefault()
  })

  win.loadURL(appUrl)
}

app.whenReady().then(() => {
  registerAppProtocol()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
