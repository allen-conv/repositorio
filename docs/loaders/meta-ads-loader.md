# meta-ads-loader

Envia os eventos de e-commerce das lojas Convertr para o **Meta Pixel**. Cada loja configura quais eventos vão, com que nome e se levam os itens, e diz se o catálogo do Meta tem variações. É o substituto planejado do `meta-pixel-loader.js`: depois de validado, ele passa a ser o loader do Meta.

- **Eventos padrão** do Meta (`ViewContent`, `AddToCart`, `InitiateCheckout`, `AddPaymentInfo`, `Purchase`, `Lead`, `CompleteRegistration`…) saem via `fbq('track')`. **Qualquer outro nome** sai via `fbq('trackCustom')`.
- **Eventos personalizados** podem ir com ou sem a lista de itens (`items: true | false`).
- **IDs conforme o catálogo** (`feedVariants`): com variações, carrinho/checkout/compra levam o ID da **variação** e página de produto/listas levam o **produto pai** como grupo; sem variações, tudo leva o ID do **produto pai**.
- **Advanced Matching:** usa os dados do [cvt-user-data](cvt-user-data.md) (`cvt_ud`), em hash SHA-256, e atualiza quando eles mudam. Não usa CPF.
- **`eventID`:** vem da plataforma (`event_id`), para deduplicar com a Conversions API quando ela existir.
- **Compra uma vez só:** o `Purchase` é deduplicado por `transaction_id`, então um F5 na página de obrigado não reenvia.

## De onde vêm os eventos

A Convertr dispara cada evento **duas vezes**: `gtag('event', ...)` e `dataLayer.push({event: ...})`. O loader considera **somente o do gtag**. Eventos com `send_to`, como os enviados pelo [google-ads-loader](google-ads-loader.md), são ignorados.

### IDs dos itens (formatos da Convertr)
| Página | Produto pai | Variação | Observação |
|---|---|---|---|
| Produto / carrinho (`view_item`, `add_to_cart`) | `item_id` | `variantion[0].variant_id` | no `view_item` normalmente só vem o pai |
| Checkout / compra (`initiate_checkout`, `add_shipping_info`, `add_payment_info`, `purchase`) | `product_id` | `variation_id` | aqui o `item_id` é o ID da **linha do carrinho**, não do produto |

### Catálogo com ou sem variações (`feedVariants`)
A única decisão é como o catálogo da loja no Meta foi montado:

| `feedVariants` | Catálogo | Eventos em que o cliente já escolheu a variação (`add_to_cart`, `remove_from_cart`, `view_cart`, `begin_checkout`, `initiate_checkout`, `add_shipping_info`, `add_payment_info`, `purchase`, `refund`) | Demais eventos (`view_item`, listas, desejos, personalizados) |
|---|---|---|---|
| `true` (padrão) | Um item por variação, com o produto pai como `item_group_id` | `content_type: 'product'` + ID da variação (se ela não vier, o pai) | `content_type: 'product_group'` + ID do produto pai |
| `false` | Um item por produto | `content_type: 'product'` + ID do produto pai | `content_type: 'product'` + ID do produto pai |

Como conferir: no Gerenciador de Comércio, abra um produto do catálogo. Se cada tamanho/cor é um item com ID próprio, use `true`. Se o produto inteiro é um item só, use `false`.

> Até a v1.0.0 isso era configurado por evento (`contentType`). Essa opção foi removida na v1.1.0.

### Início do checkout
Use `initiate_checkout` (chegada no checkout, depois que o cliente se identifica). O `begin_checkout`, disparado pelo clique no botão do carrinho, chega com a variação zerada.

## Instalação

Uma tag HTML personalizado no GTM, com acionador **Initialization - All Pages**:

```html
<script>
  window.cvtMetaConfig = {
    pixelId: '1234567890',
    feedVariants: true,   // catálogo com um item por variação? (false = um item por produto)
    events: {
      view_item: 'ViewContent',
      add_to_cart: 'AddToCart',
      initiate_checkout: 'InitiateCheckout',
      add_payment_info: 'AddPaymentInfo',
      purchase: 'Purchase',
      add_shipping_info: { name: 'AddShippingInfo', items: true },
      sign_up: { name: 'CompleteRegistration', items: false }
    }
  };
</script>
<script src="https://allen-conv.github.io/repositorio/meta-ads-loader.min.js" async></script>
```

**Antes de ativar, remova ou pause o que já envia para o mesmo pixel** (o `meta-pixel-loader.js`, tags do Meta no GTM, o pixel nativo de algum app), senão os eventos contam em dobro.

### Como configurar os eventos (`events`)
Cada chave é o **nome do evento que a loja dispara pelo gtag** e funciona como o acionador. O valor diz o que enviar ao Meta.

| Forma | Exemplo | Resultado |
|---|---|---|
| Atalho (texto) | `add_to_cart: 'AddToCart'` | nome do Meta, com itens |
| Completa | `add_shipping_info: { name: 'AddShippingInfo', items: true }` | nome do Meta e se leva itens |
| Personalizado sem itens | `login_success: { name: 'LoginCliente', items: false }` | `trackCustom('LoginCliente', { value?, currency })` |

Campos do formato completo:
- `name`: nome do evento no Meta. Se não for um evento padrão do Meta, sai como personalizado (`trackCustom`).
- `items`: `true` (padrão) envia `content_ids`, `contents`, `num_items` e `content_name`; `false` não envia itens.

Um evento que não está na lista não é enviado.

### Outras opções (`window.cvtMetaConfig`)
| Opção | Padrão | Uso |
|---|---|---|
| `pixelId` | — (obrigatório) | ID do pixel |
| `feedVariants` | `true` | o catálogo do Meta tem um item por variação? `false` = um item por produto (envia sempre o ID do produto pai) |
| `pageView` | `true` | dispara `PageView` ao carregar |
| `advancedMatching` | `true` | usa o `cvt_ud` no `fbq('init')` |
| `eventId` | `true` | envia o `event_id` da plataforma como `eventID` |
| `skipOpenbridge` | `false` | `fbq('skipOpenbridge', pixelId)` |
| `currency` | `'BRL'` | moeda quando o evento não informar |
| `debug` | `false` | log `[cvt-meta]` no console |

## Teste
- Com `debug: true`, o console mostra o resumo dos eventos configurados e cada envio, por exemplo `[cvt-meta] track AddToCart {...}` ou `[cvt-meta] trackCustom AddShippingInfo {...}`.
- Meta Pixel Helper e Gerenciador de Eventos → Testar eventos: confira `content_type`, `content_ids` e os parâmetros de Advanced Matching.
- Roteiro: produto (`ViewContent` com `product_group`) → carrinho (`AddToCart` com a variação) → checkout identificado (`InitiateCheckout`) → frete → pagamento → compra → F5 na página de obrigado (não pode reenviar).

## API
- `window.cvtMeta.send('add_to_cart', { value, currency, items: [...] })` envia manualmente usando a configuração do evento.
- `window.cvtMeta.events` mostra a configuração já normalizada.
- `window.cvtMeta.refreshMatching()` reenvia o Advanced Matching.
