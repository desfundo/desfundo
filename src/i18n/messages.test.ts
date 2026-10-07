import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { messages } from './messages'

describe('i18n messages', () => {
  it('pt and en have the same keys and value kinds', () => {
    const { pt, en } = messages
    assert.deepEqual(Object.keys(en).sort(), Object.keys(pt).sort())
    for (const key of Object.keys(pt) as (keyof typeof pt)[]) {
      assert.equal(typeof en[key], typeof pt[key], key)
      if (typeof pt[key] === 'function') {
        assert.equal((en[key] as () => string).length, (pt[key] as () => string).length, `${key} arity`)
      } else {
        assert.ok((en[key] as string).trim().length > 0, `${key} is empty in en`)
      }
    }
  })

  it('plural-aware counters read naturally', () => {
    assert.equal(messages.pt.batchMeta(1, 1, 0, false), '1 imagem · 1 pronta')
    assert.equal(messages.pt.batchMeta(3, 2, 1, true), '3 imagens · 2 prontas · 1 pendente · processando…')
    assert.equal(messages.en.batchMeta(1, 0, 1, false), '1 image · 1 pending')
    assert.equal(messages.en.pdfQueued('cat.pdf', 2), 'cat.pdf: 2 pages queued')
  })
})
