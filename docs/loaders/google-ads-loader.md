# google-ads-loader

Envia os eventos de e-commerce das lojas Convertr para o **Google Ads** direto pelo gtag, sem tags no GTM:

- **Conversões:** um rótulo por evento (compra, adição ao carrinho, início do checkout, página de produto…).
- **Remarketing dinâmico:** `view_item_list`, `view_search_results`, `view_item`, `add_to_cart` e `purchase`, com os itens (`id`, `price`, `quantity`, `google_business_vertical: 'retail'`).
- **Conversões otimizadas:** usa os dados do [cvt-user-data](cvt-user-data.md) (`cvt_ud`), quando ele estiver instalado. Envia o hash SHA-256 quando existe, senão o valor padronizado.
- **Compra uma vez só:** o `purchase` é deduplicado por `transaction_id`, então um F5 na página de obrigado não reenvia.

## De onde vêm os eventos

A Convertr dispara cada evento **duas vezes**: `gtag('event', 'view_item', {...})` e `dataLayer.push({event: 'view_item', ...})`. O loader considera **somente o do gtag** e ignora o push em objeto, para não contar em dobro.

O formato que a Convertr envia é este:
```js
gtag('event', 'view_item', {
  value: 359.9, currency: 'BRL',
  items: [{ id: 712277, item_id: 712277, item_sku: '26000102', item_name: '...', price: 359.9, quantity: 1, ... }],
  ecommerce: { ... }, eventModel: { ... }
});
```

O Ads fica num grupo próprio do gtag (`groups: 'cvt_gads'`). Assim, os eventos que a loja envia para o GA4 (sem `send_to`) não vão para o Ads, só o que este loader envia.

## Instalação

Uma tag HTML personalizado no GTM, com acionador **Initialization - All Pages**:

```html
<script>
  window.cvtGadsConfig = {
    conversionId: 'AW-123456789',
    conversions: {
      purchase: 'ROTULO_COMPRA',
      add_to_cart: 'ROTULO_CARRINHO',
      begin_checkout: 'ROTULO_CHECKOUT',
      view_item: 'ROTULO_PRODUTO'
    }
  };
</script>
<script src="https://allen-conv.github.io/repositorio/google-ads-loader.min.js" async></script>
```

> URL recomendada: GitHub Pages (`allen-conv.github.io/repositorio/...`). Ela atualiza sozinha a cada commit, e o navegador guarda o arquivo por no máximo 10 minutos. O `@main` do jsDelivr também funciona, mas já demorou a atualizar e pode ficar até 7 dias no cache do visitante.

**Antes de ativar, pause no GTM da loja as tags que fazem a mesma coisa**, senão as conversões contam em dobro: as tags de conversão do Google Ads (compra, carrinho, checkout, produto) e a de remarketing do Google Ads. A tag do Google (`AW-…`) e o vinculador de conversões podem continuar, porque o loader usa o mesmo gtag.

### Opções (`window.cvtGadsConfig`)
| Opção | Padrão | Uso |
|---|---|---|
| `conversionId` | — (obrigatório) | ID da conta, `AW-123456789` |
| `conversions` | `{}` | evento da loja → rótulo da conversão. Só os eventos listados viram conversão |
| `remarketing` | `true` | envia os eventos de remarketing dinâmico |
| `itemIdField` | `'item_id'` | campo do item que bate com o **ID do feed** no Merchant Center (`item_id`, `item_sku` ou `id`) |
| `enhancedConversions` | `true` | envia `user_data` a partir do `cvt_ud` |
| `currency` | `'BRL'` | moeda quando o evento não informar |
| `debug` | `false` | log `[cvt-gads]` no console |

`initiate_checkout` também é aceito como `begin_checkout`.

### Conferir o `itemIdField`
Na Convertr, o `item_id` dos eventos é o ID interno do produto (ex.: `712277`) e o `item_sku` é o SKU (ex.: `26000102`). Use o campo que for igual ao **ID** dos produtos no feed do Merchant Center. Se forem diferentes, o remarketing dinâmico não encontra os produtos.

## Teste
- Com `debug: true`, o console mostra cada envio: `[cvt-gads] conversão add_to_cart {...}`, `[cvt-gads] remarketing view_item {...}`, `[cvt-gads] user_data atualizado [...]`.
- Tag Assistant / DevTools → Network: requisições para `googleadservices.com/pagead/conversion/...` com o rótulo, e para `google.com/pagead/...` no remarketing.
- Roteiro: página de produto → adicionar ao carrinho → checkout → compra → F5 na página de obrigado (não pode reenviar a compra).
- No Google Ads: diagnóstico das conversões otimizadas e status das ações de conversão (24–48 h).

## API
`window.cvtGads.send('purchase', { transaction_id: '...', value: 100, currency: 'BRL', items: [...] })` envia manualmente. `window.cvtGads.syncUserData()` reenvia o `user_data` atual.
