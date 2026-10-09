import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { compareVersions } from './updateCheck'

describe('compareVersions', () => {
  it('compares each part as a number', () => {
    assert.equal(compareVersions('0.10.0', '0.9.9'), 1)
    assert.equal(compareVersions('0.5.2', '0.5.10'), -1)
    assert.equal(compareVersions('1.0.0', '1.0.0'), 0)
  })

  it('ignores a leading v and missing parts', () => {
    assert.equal(compareVersions('v0.5.2', '0.5.2'), 0)
    assert.equal(compareVersions('0.6', '0.5.9'), 1)
    assert.equal(compareVersions('1.0', '1.0.0'), 0)
  })
})
