/** `foto.png` twice (or `foto.jpg` + `foto.png`) must not overwrite each other in the ZIP. */
export function uniqueZipName(name: string, used: Set<string>): string {
  let candidate = name
  for (let n = 2; used.has(candidate.toLowerCase()); n++) {
    candidate = name.replace(/(\.[^.]+)?$/, `-${n}$1`)
  }
  used.add(candidate.toLowerCase())
  return candidate
}
