import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { uniqueZipName } from './zipNames'

describe('uniqueZipName', () => {
  it('keeps the first name and suffixes repeats before the extension', () => {
    const used = new Set<string>()
    assert.equal(uniqueZipName('foto-sem-fundo.png', used), 'foto-sem-fundo.png')
    assert.equal(uniqueZipName('foto-sem-fundo.png', used), 'foto-sem-fundo-2.png')
    assert.equal(uniqueZipName('foto-sem-fundo.png', used), 'foto-sem-fundo-3.png')
  })

  it('treats names case-insensitively (Windows file system)', () => {
    const used = new Set<string>()
    uniqueZipName('Foto.png', used)
    assert.equal(uniqueZipName('foto.png', used), 'foto-2.png')
  })
})
