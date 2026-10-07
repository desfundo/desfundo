import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { pdfPageFileName, renderScale } from './pdfPages.ts'

describe('pdf page names', () => {
  it('numbers pages so a catalog stays in order', () => {
    assert.equal(pdfPageFileName('catalogo.pdf', 1, 12), 'catalogo-p01.png')
    assert.equal(pdfPageFileName('catalogo.pdf', 12, 12), 'catalogo-p12.png')
    assert.equal(pdfPageFileName('linha.final.pdf', 3, 100), 'linha.final-p003.png')
  })
})

describe('pdf render scale', () => {
  it('keeps the longest side near the memory cap', () => {
    assert.equal(renderScale(1000, 500, 1600), 1.6)
    assert.equal(renderScale(4000, 2000, 1600), 0.4)
    assert.equal(renderScale(100, 80, 1600), 2)
  })
})
