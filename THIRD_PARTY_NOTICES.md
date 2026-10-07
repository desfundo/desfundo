# Componentes de terceiros

O Desfundo é distribuído sob a [AGPL-3.0](LICENSE). Ele inclui ou usa os componentes abaixo, cada um sob a sua própria licença.

| Componente | Versão | Licença | Uso |
|---|---|---|---|
| [@imgly/background-removal](https://github.com/imgly/background-removal-js) | 1.7.0 | AGPL-3.0 | Motor de remoção de fundo |
| [@imgly/background-removal-data](https://github.com/imgly/background-removal-js) | 1.7.0 | AGPL-3.0 | Modelo `isnet_fp16` e runtime ONNX embutidos no app (`npm run imgly:data`) |
| [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) | 1.21.0 | MIT | Execução do modelo (via IMG.LY) |
| [PDF.js](https://github.com/mozilla/pdf.js) (`pdfjs-dist`) | 5.7.284 | Apache-2.0 | Leitura de catálogos em PDF |
| [React](https://react.dev) / React DOM | 19.2.8 | MIT | Interface |
| [TanStack Virtual](https://github.com/TanStack/virtual) | 3.14.9 | MIT | Lista virtualizada |
| [JSZip](https://github.com/Stuk/jszip) | 3.10.1 | MIT (dual MIT / GPL-3.0) | Download em ZIP |
| [FileSaver.js](https://github.com/eligrey/FileSaver.js) | 2.0.5 | MIT | Download de arquivos |
| [Bricolage Grotesque](https://github.com/ateliertriay/bricolage) (Fontsource) | 5.3.0 | OFL-1.1 | Fonte de títulos |
| [Figtree](https://github.com/erikdkennedy/figtree) (Fontsource) | 5.3.0 | OFL-1.1 | Fonte de texto |
| [Electron](https://www.electronjs.org) | 37.10.3 | MIT | App desktop (inclui Chromium; licenças em `LICENSES.chromium.html` no app) |

O modelo de segmentação usado pela IMG.LY é derivado do IS-Net / DIS (Qin et al., *Highly Accurate Dichotomous Image Segmentation*, ECCV 2022).

As imagens em `public/fixtures/` são sintéticas, geradas para testes (CC0).
