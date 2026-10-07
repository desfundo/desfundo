/** Public project links shown in the app footer. */

export const SOURCE_URL = 'https://github.com/desfundo/desfundo'

export const LICENSE_NAME = 'AGPL-3.0'

/**
 * Donation channels. A link only shows up in the app once it has a `url`.
 * Pix: use a random key (chave aleatória) — whatever goes here is public.
 */
export const DONATE_LINKS: { label: string; url: string }[] = [
  { label: 'GitHub Sponsors', url: 'https://github.com/sponsors/fabbbb12' },
]

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
