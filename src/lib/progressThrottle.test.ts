import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createProgressThrottler } from './progressThrottle.ts'

function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}

describe('createProgressThrottler', () => {
  it('emits leading update immediately', () => {
    const seen: number[] = []
    const t = createProgressThrottler(50, (_id, p) => seen.push(p))
    t.push('a', 0.1)
    assert.deepEqual(seen, [0.1])
  })

  it('coalesces bursts and emits trailing value', async () => {
    const seen: number[] = []
    const t = createProgressThrottler(40, (_id, p) => seen.push(p))
    t.push('a', 0.1)
    t.push('a', 0.2)
    t.push('a', 0.3)
    t.push('a', 0.9)
    assert.deepEqual(seen, [0.1])
    await delay(60)
    assert.deepEqual(seen, [0.1, 0.9])
  })

  it('flushNow forces the pending value', () => {
    const seen: number[] = []
    const t = createProgressThrottler(10_000, (_id, p) => seen.push(p))
    t.push('a', 0.1)
    t.push('a', 0.55)
    t.flushNow()
    assert.deepEqual(seen, [0.1, 0.55])
  })
})
