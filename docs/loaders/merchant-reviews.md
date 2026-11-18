# merchant_reviews.js

Exibe o **opt-in de avaliações do cliente do Google** (Google Customer Reviews / Merchant Center) depois da compra.

- URL: `https://cdn.jsdelivr.net/gh/allen-conv/repositorio@main/merchant_reviews.js`
- Ao ver um `purchase` no dataLayer, carrega `apis.google.com/js/platform.js` e chama `gapi.surveyoptin.render` com `merchant_id`, `order_id` (`transaction_id`), e-mail do cliente, país de entrega e data estimada de entrega (hoje + `shipping.estimated_delivery_date` dias).

## Configuração (antes do script)
| Variável | Obrigatória | Uso |
|---|---|---|
| `window.merchant_id` | sim | ID do Merchant Center |

## Instalação (GTM)
```html
<script>window.merchant_id = 123456789;</script>
<script src="https://cdn.jsdelivr.net/gh/allen-conv/repositorio@main/merchant_reviews.js" async></script>
```

## Lojas que usam
Ver [lojas.md](../lojas.md).
