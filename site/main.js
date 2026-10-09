// Shared by the Portuguese (/) and English (/en/) pages. Text comes from the page;
// only the few strings built here are localized below.
const LANG = document.documentElement.lang.startsWith('pt') ? 'pt' : 'en'
const LOCALE = LANG === 'pt' ? 'pt-BR' : 'en-US'
const T = {
  pt: { copied: 'Copiado!', copyFailed: 'Não foi possível copiar', downloads: 'downloads' },
  en: { copied: 'Copied!', copyFailed: 'Could not copy', downloads: 'downloads' },
}[LANG]

// Site root (this script lives there), so /en/ can share the images.
const ROOT = new URL('.', document.currentScript.src).href

// Language switch: remember an explicit choice so the auto-redirect never fights it.
document.querySelectorAll('[data-lang]').forEach((a) => {
  a.addEventListener('click', () => {
    try { localStorage.setItem('lang', a.dataset.lang) } catch {}
  })
})

const compare = document.getElementById('compare')
compare.querySelector('input').addEventListener('input', (e) => compare.style.setProperty('--pos', e.target.value + '%'))

document.querySelectorAll('#thumbs button').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#thumbs button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)))
    document.getElementById('cmp-before').src = ROOT + 'img/' + btn.dataset.before
    document.getElementById('cmp-after').src = ROOT + 'img/' + btn.dataset.after
  })
})

// Download counter: GitHub's own public count of .exe downloads across all releases.
// No tracking — nothing about the visitor is collected. Hidden below the threshold.
const DOWNLOADS_MIN_TO_SHOW = 100
function showDownloads(total) {
  if (!(total >= DOWNLOADS_MIN_TO_SHOW)) return
  const el = document.getElementById('downloads')
  el.textContent = total.toLocaleString(LOCALE) + ' ' + T.downloads
  el.hidden = false
}
fetch('https://api.github.com/repos/desfundo/desfundo/releases?per_page=100')
  .then((r) => (r.ok ? r.json() : []))
  .then((releases) => showDownloads(
    releases.flatMap((r) => r.assets ?? []).filter((a) => a.name.endsWith('.exe')).reduce((sum, a) => sum + a.download_count, 0),
  ))
  .catch(() => {})

const fmt = (mb) => mb >= 1000 ? (mb / 1000).toLocaleString(LOCALE, { maximumFractionDigits: 1 }) + ' GB' : Math.round(mb) + ' MB'
const n = document.getElementById('n'), mb = document.getElementById('mb')
const APP_MB = 170
function updateCalc() {
  const online = Number(n.value) * Number(mb.value) * 2
  document.getElementById('n-out').textContent = Number(n.value).toLocaleString(LOCALE)
  document.getElementById('mb-out').textContent = mb.value
  document.getElementById('online-out').textContent = fmt(online)
  const max = Math.max(online, APP_MB)
  document.getElementById('online-bar').style.width = (online / max) * 100 + '%'
  document.getElementById('app-bar').style.width = Math.max(1, (APP_MB / max) * 100) + '%'
}
n.addEventListener('input', updateCalc); mb.addEventListener('input', updateCalc); updateCalc()

// PayPal donate links (BRL / USD) for the account below.
const PAYPAL_ACCOUNT = 'fabricio.vale@live.com'
document.querySelectorAll('[data-paypal]').forEach((a) => {
  const params = new URLSearchParams({
    business: PAYPAL_ACCOUNT,
    currency_code: a.dataset.paypal,
    item_name: a.dataset.paypal === 'BRL' ? 'Doação para o Desfundo' : 'Donation to Desfundo',
    no_recurring: '0',
  })
  a.href = 'https://www.paypal.com/donate/?' + params
})

document.querySelectorAll('[data-copy]').forEach((btn) => {
  const label = btn.textContent
  btn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(btn.dataset.copy); btn.textContent = T.copied }
    catch { btn.textContent = T.copyFailed }
    setTimeout(() => (btn.textContent = label), 2000)
  })
})

// Video: swap the poster for the YouTube player only after a click (no third-party
// requests before that). Subtitles on by default, since the video has no audio.
document.querySelectorAll('.video[data-video]').forEach((box) => {
  box.querySelector('.video-play').addEventListener('click', () => {
    const cc = box.dataset.cc
    const params = new URLSearchParams({ autoplay: '1', rel: '0', cc_load_policy: '1', cc_lang_pref: cc, hl: cc === 'pt' ? 'pt-BR' : 'en' })
    const iframe = document.createElement('iframe')
    iframe.src = 'https://www.youtube-nocookie.com/embed/' + box.dataset.video + '?' + params
    iframe.title = box.querySelector('.video-play').getAttribute('aria-label')
    iframe.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'
    iframe.allowFullscreen = true
    iframe.referrerPolicy = 'strict-origin-when-cross-origin'
    box.replaceChildren(iframe)
  })
})
