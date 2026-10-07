/** Public project links shown in the app footer. */

import type { Lang } from '../i18n/messages'

export const SOURCE_URL = 'https://github.com/desfundo/desfundo'

export const LICENSE_NAME = 'AGPL-3.0'

/** PayPal account that receives donations (public on purpose — shown on the PayPal page). */
const PAYPAL_ACCOUNT = 'fabricio.vale@live.com'

function paypalDonateUrl(lang: Lang): string {
  return (
    'https://www.paypal.com/donate/?' +
    new URLSearchParams({
      business: PAYPAL_ACCOUNT,
      currency_code: lang === 'pt' ? 'BRL' : 'USD',
      item_name: lang === 'pt' ? 'Doação para o Desfundo' : 'Donation to Desfundo',
      no_recurring: '0',
    })
  )
}

/** Footer donation links (Pix has its own dialog). PayPal in BRL for PT, USD for EN. */
export function donateLinks(lang: Lang): { label: string; url: string }[] {
  return [
    { label: 'PayPal', url: paypalDonateUrl(lang) },
    { label: 'GitHub Sponsors', url: 'https://github.com/sponsors/fabbbb12' },
  ]
}

/**
 * Pix donation. Random key only (never CPF/phone/e-mail): this file is public.
 * Name/city are neutral on purpose — the payer's bank shows the real holder at
 * confirmation. After changing anything here run `npm run pix:qr`.
 */
export const PIX = {
  key: 'de539899-0b61-484e-9e9f-eed74734be86',
  name: 'Desfundo',
  city: 'Brasil',
} as const

/** Told to the donor up front, so the holder name at bank confirmation isn't a surprise. */
export const PIX_HOLDER_FIRST_NAME = 'Fabricio'

export const CREDITS = [
  { name: 'IMG.LY background-removal', url: 'https://github.com/imgly/background-removal-js', license: 'AGPL-3.0' },
  { name: 'ONNX Runtime Web', url: 'https://github.com/microsoft/onnxruntime', license: 'MIT' },
  { name: 'PDF.js', url: 'https://github.com/mozilla/pdf.js', license: 'Apache-2.0' },
  { name: 'React', url: 'https://react.dev', license: 'MIT' },
] as const
