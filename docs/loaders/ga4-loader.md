# ga4-loader

Envia os eventos das lojas Convertr para uma propriedade do **GA4**. Cada loja configura quais eventos vão, com que nome, se levam os itens e quais parâmetros extras acompanham.

- Só considera os eventos do **gtag**. O `dataLayer.push` duplicado da Convertr é ignorado, assim como eventos com `send_to` (de outros loaders).
- O GA4 fica num **grupo próprio do gtag** (`cvt_ga4`) e só recebe o que este loader envia.
- **Itens no esquema do GA4:** `item_id`, `item_name`, `item_variant`, `item_category`, `price`, `quantity`, `index`… O `item_id` pode ser o produto pai, a variação ou o SKU.
- **Eventos personalizados** com ou sem itens, com parâmetros copiados do evento da loja ou valores fixos.
- **Opcional:** `user_id` e dados fornecidos pelo usuário a partir do [cvt-user-data](cvt-user-data.md).
- **Compra uma vez só:** o `purchase` é deduplicado por `transaction_id`, então um F5 na página de obrigado não reenvia.

## ⚠️ Antes de instalar: o GA4 nativo da plataforma

A Convertr já envia os eventos para o G- informado em **Configurações → Geral** do painel. Se o loader usar **o mesmo G-**, os eventos contam em dobro. Escolha uma opção:
1. **Trocar o envio nativo pelo loader:** retire o G- do painel da Convertr e use o loader com esse G-. Assim você passa a controlar nomes, itens e parâmetros.
2. **Manter o nativo e usar o loader em outra propriedade:** por exemplo, uma propriedade da agência ou de consolidação, com outro G-.

## Instalação

Uma tag HTML personalizado no GTM, com acionador **Initialization - All Pages**:

```html
<script>
  window.cvtGa4Config = {
    measurementId: 'G-XXXXXXXXXX',
    events: {
      view_item: 'view_item',
      add_to_cart: 'add_to_cart',
      initiate_checkout: 'begin_checkout',
      add_shipping_info: { name: 'add_shipping_info', params: ['shipping_tier'] },
      add_payment_info: 'add_payment_info',
      purchase: 'purchase',
      login_success: { name: 'login', items: false, extra: { method: 'site' } }
    },
    itemId: 'product'
  };
</script>
<script src="https://allen-conv.github.io/repositorio/ga4-loader.min.js" async></script>
```

### Como configurar os eventos (`events`)
Cada chave é o **nome do evento que a loja dispara pelo gtag** e funciona como acionador. O valor diz o que enviar ao GA4.

| Forma | Exemplo | Resultado |
|---|---|---|
| Atalho (texto) | `add_to_cart: 'add_to_cart'` | mesmo nome; com itens se for evento de e-commerce do GA4 |
| Renomear | `initiate_checkout: 'begin_checkout'` | envia como `begin_checkout` |
| Personalizado com itens | `compre_junto: { name: 'compre_junto', items: true }` | evento próprio com `items` |
| Personalizado sem itens | `newsletter: { name: 'cadastro_newsletter', items: false }` | evento próprio sem `items` |
| Com parâmetros | `add_shipping_info: { name: 'add_shipping_info', params: ['shipping_tier'] }` | copia `shipping_tier` do evento da loja |
| Com valor fixo | `login_success: { name: 'login', items: false, extra: { method: 'site' } }` | envia `method: 'site'` |

Campos do formato completo:
- `name`: nome do evento no GA4.
- `items`: por padrão, `true` para os eventos de e-commerce do GA4 e `false` para os demais. Informe `true` ou `false` para forçar.
- `params`: nomes de campos do evento da loja a copiar.
- `extra`: parâmetros fixos.

Eventos de e-commerce do GA4 (com itens por padrão): `view_item_list`, `select_item`, `view_item`, `add_to_wishlist`, `add_to_cart`, `remove_from_cart`, `view_cart`, `begin_checkout`, `add_shipping_info`, `add_payment_info`, `purchase`, `refund`, `view_promotion`, `select_promotion`.

**Copiados automaticamente quando a loja envia:** `value`, `currency`, `transaction_id`, `affiliation`, `coupon`, `shipping`, `tax`, `payment_type`, `shipping_tier`, `item_list_id`, `item_list_name`, `promotion_id`, `promotion_name`, `creative_name`, `creative_slot`, `search_term`, `method`, `content_type`.

Um evento que não está na lista não é enviado.

### IDs dos itens (`itemId`)
| Valor | Usa | Observação |
|---|---|---|
| `'product'` (padrão) | produto pai | `item_id` na página de produto e no carrinho; `product_id` no checkout e na compra |
| `'variant'` | variação | `variantion[0].variant_id` / `variation_id`; sem variação, usa o pai |
| `'sku'` | SKU | `item_sku` |

No checkout e na compra, o `item_id` da Convertr é o ID da **linha do carrinho**. O loader usa o `product_id` nesses casos. O tamanho ou cor (`variantion[0].value`) vai em `item_variant`.

### Outras opções (`window.cvtGa4Config`)
| Opção | Padrão | Uso |
|---|---|---|
| `measurementId` | — (obrigatório) | `G-XXXXXXXXXX` |
| `sendPageView` | `true` | `page_view` ao carregar. Navegação SPA: ative "Mudanças de página baseadas em eventos do histórico" na medição otimizada da propriedade |
| `userId` | `false` | envia `user_id` com o ID do cliente (`cvt_ud`) |
| `userData` | `false` | envia dados fornecidos pelo usuário (hash, `cvt_ud`). Exige ativar a coleta na propriedade |
| `currency` | `'BRL'` | moeda quando o evento não informar |
| `debug` | `false` | log `[cvt-ga4]` no console |

## Teste
- Com `debug: true`, o console mostra os eventos configurados e cada envio, por exemplo `[cvt-ga4] event add_to_cart {...}`.
- No GA4: **Admin → DebugView** (com `debug_mode` ou a extensão Tag Assistant) e o relatório de Tempo real.
- Roteiro: produto → carrinho → checkout identificado → frete → pagamento → compra → F5 na página de obrigado (não pode reenviar a compra).

## API
- `window.cvtGa4.send('add_to_cart', { value, currency, items: [...] })` envia manualmente usando a configuração do evento.
- `window.cvtGa4.events` mostra a configuração já normalizada.
