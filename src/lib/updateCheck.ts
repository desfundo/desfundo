/**
 * "Check for updates" for the portable build. Runs only when the user clicks the
 * button: one GET to GitHub's public API, nothing about the user is sent.
 */

const LATEST_RELEASE_API = 'https://api.github.com/repos/desfundo/desfundo/releases/latest'

export type UpdateInfo = { version: string; url: string }

/** Numeric compare of "1.2.3" style versions (a leading "v" is ignored). */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.replace(/^v/i, '').split(/[.-]/).map((n) => parseInt(n, 10) || 0)
  const pa = parts(a)
  const pb = parts(b)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return Math.sign(diff)
  }
  return 0
}

/** Latest release if it is newer than `current`, otherwise null. Throws when offline. */
export async function findUpdate(current: string): Promise<UpdateInfo | null> {
  const res = await fetch(LATEST_RELEASE_API, { headers: { Accept: 'application/vnd.github+json' } })
  if (!res.ok) throw new Error(`GitHub API ${res.status}`)
  const release = (await res.json()) as { tag_name?: string; html_url?: string }
  if (!release.tag_name || !release.html_url) throw new Error('Unexpected GitHub API response')
  const version = release.tag_name.replace(/^v/i, '')
  return compareVersions(version, current) > 0 ? { version, url: release.html_url } : null
}

/** The Microsoft Store build updates itself; main.cjs marks it with ?store. */
export function isStoreBuild(): boolean {
  return new URLSearchParams(globalThis.location?.search ?? '').has('store')
}
