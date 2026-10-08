# Desfundo

Remova o fundo de dezenas de fotos de produto de uma vez, direto no seu computador.

- **Em massa:** solte quantas imagens quiser (PNG, JPG, WEBP, BMP) ou um catálogo em PDF. Cada página vira uma foto na fila.
- **Local e offline:** o modelo de IA vem dentro do app. Suas fotos nunca saem do computador, e não é preciso internet.
- **Ajuste por foto:** retoque automático de bordas, borracha/restaurar, anti-reflexo, rotação, espelho, brilho, contraste e corte das áreas vazias.
- **Exportação:** PNG transparente, com fundo branco ou preto, uma a uma ou tudo em ZIP. Dá para baixar o que já está pronto enquanto a fila continua.

Gratuito e de código aberto.

## Baixar

Baixe o `Desfundo-<versão>-portable.exe` na página de [Releases](https://github.com/desfundo/desfundo/releases) e abra. Não precisa instalar.

> O executável não tem assinatura digital paga, então o Windows SmartScreen pode avisar na primeira vez. Clique em **Mais informações → Executar assim mesmo**.

## Apoie o projeto

O Desfundo é gratuito. Se ele economizou o seu tempo, considere apoiar o desenvolvimento. Os links de doação também ficam no rodapé do app.

- **Pix:** pelo botão "Pix" no rodapé do app (QR code e copia e cola)
- [GitHub Sponsors](https://github.com/sponsors/fabbbb12)

## Desenvolvimento

Requisitos: Node.js 20+ e Windows para gerar o `.exe`.

```bash
npm install
npm run desktop     # build + abre o app Electron
npm run dev         # só a interface, no navegador (http://127.0.0.1:5173)
npm test            # testes unitários
npm run dist:win    # gera release/Desfundo-<versão>-portable.exe
```

O primeiro build baixa o modelo da IMG.LY (~100 MB, hash verificado) para `public/imgly/`. Os builds seguintes funcionam offline.

### Como funciona

- O motor é o [`@imgly/background-removal`](https://github.com/imgly/background-removal-js) (modelo IS-Net), rodando com ONNX Runtime num Web Worker para a tela não travar.
- O Electron serve o app pelo protocolo `app://` com isolamento de origem (COOP/COEP). Isso libera o processamento multi-thread do WebAssembly.
- Resultados ficam na memória e são movidos para o IndexedDB quando ficam ociosos. Assim filas grandes não estouram a RAM.
- PDFs são lidos com [PDF.js](https://github.com/mozilla/pdf.js). Cada página vira uma imagem de até 1600 px.

Limitação atual do PDF: uma página vira um item. Se a página tiver vários produtos, o fundo é removido da página inteira.

## Contato

[desfundo@outlook.com](mailto:desfundo@outlook.com) ou [Discussions](https://github.com/desfundo/desfundo/discussions).

## Licença

[AGPL-3.0](LICENSE). Você pode usar, copiar, modificar e redistribuir, inclusive comercialmente, desde que o código-fonte das versões distribuídas continue disponível sob a mesma licença.

O motor de remoção de fundo é da [IMG.LY](https://img.ly), também sob AGPL-3.0. Componentes de terceiros e suas licenças estão em [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
