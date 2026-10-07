import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { buildPixPayload, crc16 } from './pix'

describe('Pix BR Code', () => {
  it('uses CRC16-CCITT-FALSE (standard check value)', () => {
    assert.equal(crc16('123456789'), '29B1')
  })

  it('builds a static open-amount code in the bank layout', () => {
    const body =
      '000201010211' +
      '26580014br.gov.bcb.pix0136de539899-0b61-484e-9e9f-eed74734be86' +
      '52040000530398658' + '02BR' +
      '5908DESFUNDO' +
      '6006BRASIL' +
      '62070503***' +
      '6304'
    const ours = buildPixPayload({
      key: 'de539899-0b61-484e-9e9f-eed74734be86',
      name: 'Desfundo',
      city: 'Brasil',
    })
    assert.equal(ours, body + crc16(body))
  })

  it('strips accents and caps name/city length', () => {
    const payload = buildPixPayload({ key: 'k', name: 'Ação de Teste Muito Longa Demais', city: 'São José dos Campos' })
    assert.match(payload, /5925ACAO DE TESTE MUITO LONGA6015/)
    assert.match(payload, /6015SAO JOSE DOS CA/)
  })
})
