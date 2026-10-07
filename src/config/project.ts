/** Public project links shown in the app footer. */

export const SOURCE_URL = 'https://github.com/fabbbb12/desfundo'

export const LICENSE_NAME = 'AGPL-3.0'

/**
 * Donation channels. A link only shows up in the app once it has a `url`.
 * Pix: use a random key (chave aleatória) — whatever goes here is public.
 */
export const DONATE_LINKS: { label: string; url: string }[] = [
  { label: 'GitHub Sponsors', url: 'https://github.com/sponsors/fabbbb12' },
]

export const CREDITS = [
  { name: 'IMG.LY background-removal', url: 'https://github.com/imgly/background-removal-js', license: 'AGPL-3.0' },
  { name: 'ONNX Runtime Web', url: 'https://github.com/microsoft/onnxruntime', license: 'MIT' },
  { name: 'PDF.js', url: 'https://github.com/mozilla/pdf.js', license: 'Apache-2.0' },
  { name: 'React', url: 'https://react.dev', license: 'MIT' },
] as const
