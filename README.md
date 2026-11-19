# Loaders Convertr

Repositório **interno** da Convertr com loaders (scripts JS) para inserir nas lojas dos clientes. Ele serve para:

- integrar ferramentas de terceiros (Edrone, Sizebay, Meta, Google…);
- padronizar recursos que normalmente seriam montados no GTM loja por loja;
- oferecer recursos extras que podem ser replicados em várias lojas.

Cada loja carrega o arquivo direto deste repositório pelo jsDelivr. Uma edição aqui atualiza todas as lojas de uma vez, sem depender do time de desenvolvimento.

```
https://cdn.jsdelivr.net/gh/allen-conv/repositorio@main/<arquivo>
```

> ⚠️ **Não mova nem renomeie os `.js` da raiz.** A URL de cada loader é o caminho do arquivo. Mudar o caminho quebra todas as lojas que usam o loader. Antes de qualquer mudança de caminho: levantar os GTMs que apontam para o arquivo ([docs/lojas.md](docs/lojas.md)), trocar o apontamento e só então mover.

## Loaders

| Arquivo (raiz) | O que faz | Configuração na loja | Doc |
|---|---|---|---|
| `cvt-user-data-loader.min.js` | Captura, padroniza e armazena os dados que o cliente informa (legíveis + SHA-256; localStorage com aceite, sessionStorage sem). Não envia nada. | `window.cvtUDConfig` (opcional) | [cvt-user-data](docs/loaders/cvt-user-data.md) |
| `ga4-loader.min.js` | Envia os eventos da loja (gtag) para uma propriedade GA4: eventos configuráveis, personalizados com/sem itens, parâmetros extras, `user_id`/user_data via `cvt_ud`. | `window.cvtGa4Config = { measurementId, events }` | [ga4-loader](docs/loaders/ga4-loader.md) |
| `google-ads-loader.min.js` | Envia os eventos de e-commerce (gtag) para o Google Ads: conversões, remarketing dinâmico e conversões otimizadas via `cvt_ud`. | `window.cvtGadsConfig = { conversionId, conversions }` | [google-ads-loader](docs/loaders/google-ads-loader.md) |
| `edrone-loader.min.js` | Integração com a Edrone | `edrone_app_id`, `edrone_store_id`, `edrone_debug` | [edrone](docs/loaders/edrone.md) |
| `google-ads.js` | Ponte de conversões do Google Ads a partir do dataLayer | `GADS_CONFIG = { conversionId, sendTo, debug }` | [google-ads](docs/loaders/google-ads.md) |
| `merchant-reviews-loader.min.js` | Opt-in de avaliações do Google (Merchant Center) na confirmação da compra: só o `purchase` do gtag, uma vez por pedido, e-mail do pedido ou do `cvt_ud`, data de entrega com margem. Substituto planejado do `merchant_reviews.js`. | `window.cvtMerchantReviewsConfig = { merchantId }` | [merchant-reviews-loader](docs/loaders/merchant-reviews-loader.md) |
| `merchant_reviews.js` | Opt-in de avaliações do Google (Merchant Center) | `merchant_id` | [merchant-reviews](docs/loaders/merchant-reviews.md) |
| `meta-ads-loader.min.js` | Envia os eventos de e-commerce (gtag) para o Meta Pixel: eventos configuráveis, personalizados com/sem itens, `content_type` produto/grupo, Advanced Matching via `cvt_ud`. Substituto planejado do `meta-pixel-loader.js`. | `window.cvtMetaConfig = { pixelId, events }` | [meta-ads-loader](docs/loaders/meta-ads-loader.md) |
| `meta-pixel-loader.js` | Meta Pixel (base, eventos e Advanced Matching) | `meta_pixel_id`, `meta_debug`, `meta_skip_openbridge`, `meta_disable_event_id`, `meta_dedupe_window_ms` | [meta-pixel](docs/loaders/meta-pixel.md) |
| `sizebay-loader.min.js` | Provador virtual Sizebay | `sizebay_tenant_id`, `sizebay_country`, `sizebay_send_cart`, `sizebay_debug` | [sizebay](docs/loaders/sizebay.md) |

Lojas e containers que usam os loaders: [docs/lojas.md](docs/lojas.md).

## Estrutura

```
/                         arquivos servidos às lojas (não mover)
├── *.js, *.min.js
├── src/<loader>/         código-fonte e testes de loaders com build (cvt-user-data, google-ads, meta-ads, ga4, merchant-reviews)
├── docs/
│   ├── loaders/          uma página por loader
│   ├── lojas.md          lojas × containers GTM × loaders
│   └── convencoes.md     como criar e publicar um loader
└── .github/workflows/
    ├── purge-jsdelivr.yml    limpa o cache @main dos .js alterados a cada push
    ├── build-user-data.yml   testa, minifica e publica o cvt-user-data-loader
    ├── build-google-ads.yml  testa, minifica e publica o google-ads-loader
    ├── build-meta-ads.yml    testa, minifica e publica o meta-ads-loader
    ├── build-ga4.yml         testa, minifica e publica o ga4-loader
    └── build-merchant-reviews.yml  testa, minifica e publica o merchant-reviews-loader
```

## Publicação

- **Loaders editados direto na raiz** (os 5 originais): commit na `main` → `purge-jsdelivr.yml` limpa o cache → as lojas recebem em minutos.
- **Loaders com fonte em `src/`** (cvt-user-data, google-ads, meta-ads, ga4, merchant-reviews): edite só o fonte → a Action testa, gera o arquivo da raiz, commita e limpa o cache. Se um teste falhar, nada é publicado.

Tudo o que entra na `main` vai na hora para **todas** as lojas que usam o loader. Regras e checklist em [docs/convencoes.md](docs/convencoes.md).
