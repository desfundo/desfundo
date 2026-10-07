/**
 * Static Pix "copia e cola" (BR Code, EMV QR) for donations with an open amount.
 * Merchant name/city are free text shown before payment; the payer's bank always
 * shows the real account holder at confirmation, so we keep personal data out of
 * the public source.
 */

function field(id: string, value: string): string {
  return id + String(value.length).padStart(2, '0') + value
}

/** CRC16-CCITT (0x1021, init 0xFFFF), as required by the BR Code spec. */
export function crc16(payload: string): string {
  let crc = 0xffff
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

export function buildPixPayload(opts: { key: string; name: string; city: string }): string {
  const ascii = (s: string, max: number) =>
    s.normalize('NFD').replace(/[^\x20-\x7E]/g, '').toUpperCase().slice(0, max)

  const body =
    field('00', '01') +
    field('01', '11') + // static QR, reusable
    field('26', field('00', 'br.gov.bcb.pix') + field('01', opts.key)) +
    field('52', '0000') +
    field('53', '986') +
    field('58', 'BR') +
    field('59', ascii(opts.name, 25)) +
    field('60', ascii(opts.city, 15)) +
    field('62', field('05', '***')) +
    '6304'
  return body + crc16(body)
}
