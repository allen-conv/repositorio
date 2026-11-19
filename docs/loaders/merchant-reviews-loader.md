# merchant-reviews-loader

Exibe o **opt-in de avaliações do Google** (Google Customer Reviews, do Merchant Center) na página de confirmação da compra. O cliente aceita receber a pesquisa, e o Google envia o e-mail de avaliação depois da data estimada de entrega.

É o substituto planejado do `merchant_reviews.js`. Em relação a ele:
- **Só o `purchase` do gtag:** o `dataLayer.push({event: 'purchase'})` duplicado da Convertr é ignorado. O loader antigo escutava esse push.
- **Uma vez por pedido** (`transaction_id`): um F5 na página de obrigado não reabre o pop-up.
- **E-mail do pedido** (`customer.email`) ou, na falta, do [cvt-user-data](cvt-user-data.md). Sem e-mail válido, o pop-up não aparece, porque o Google exige o e-mail.
- **Data estimada de entrega** a partir do frete da plataforma (data ou prazo em dias), **com margem configurável**. Sem informação da plataforma, usa um prazo padrão de 7 dias, em vez de 1 dia como o antigo, que fazia a pesquisa chegar antes do produto.
- **Estilo do pop-up**, **GTIN dos produtos** (opcional) e **idioma** configuráveis.

## Instalação

Uma tag HTML personalizado no GTM, com acionador **Initialization - All Pages**. O loader só age quando chega um `purchase`.

```html
<script>
  window.cvtMerchantReviewsConfig = {
    merchantId: 123456789,
    optInStyle: 'CENTER_DIALOG',
    defaultDeliveryDays: 7,
    extraDeliveryDays: 2
  };
</script>
<script src="https://allen-conv.github.io/repositorio/merchant-reviews-loader.min.js" async></script>
```

**Antes de ativar, remova ou pause o `merchant_reviews.js`** (ou a tag "Merchant Center - Avaliação"), senão o pop-up pode abrir duas vezes. Se a loja ainda define `window.merchant_id`, o loader novo também aceita esse valor.

### Opções (`window.cvtMerchantReviewsConfig`)
| Opção | Padrão | Uso |
|---|---|---|
| `merchantId` | — (obrigatório) | ID da conta do Merchant Center |
| `optInStyle` | `'CENTER_DIALOG'` | posição do pop-up: `CENTER_DIALOG`, `BOTTOM_RIGHT_DIALOG`, `BOTTOM_LEFT_DIALOG`, `TOP_RIGHT_DIALOG`, `TOP_LEFT_DIALOG`, `BOTTOM_TRAY` |
| `defaultDeliveryDays` | `7` | prazo usado quando a plataforma não informa a entrega |
| `extraDeliveryDays` | `2` | dias somados à data de entrega, para a pesquisa chegar depois do produto |
| `defaultCountry` | `'BR'` | país de entrega quando o pedido não informa |
| `gtinField` | `null` | campo do item com o GTIN/EAN (ex.: `'ean'`). Se preenchido, envia `products: [{gtin}]` para avaliação de produto |
| `lang` | `'pt_BR'` | idioma do pop-up (`false` para não definir) |
| `debug` | `false` | log `[cvt-gcr]` no console |

### De onde vêm os dados do pedido
| Campo do Google | Origem no `purchase` da Convertr |
|---|---|
| `order_id` | `transaction_id` |
| `email` | `customer.email` → `email` → `cvt_ud.data.email` |
| `delivery_country` | `shipping.delivery_country` (Brasil/BR → `BR`) → `defaultCountry` |
| `estimated_delivery_date` | `shipping.estimated_delivery_date` (prazo em dias) ou `shipping.delivery_date` (data `AAAA-MM-DD` ou `DD/MM/AAAA`), + `extraDeliveryDays`. Data ausente ou no passado → hoje + `defaultDeliveryDays` |
| `products` | `items[][gtinField]`, se configurado |

Os campos são lidos do evento ou de `eventModel`.

## Teste
- Com `debug: true`, o console mostra o que foi enviado ao Google: `[cvt-gcr] opt-in {merchant_id, order_id, email, ...}`.
- Para simular sem comprar (abre o pop-up de verdade; use um e-mail seu):
  ```js
  cvtMerchantReviews.show({ transaction_id: 'TESTE-1', customer: { email: 'voce@exemplo.com' }, shipping: { delivery_country: 'BR', estimated_delivery_date: 5 } });
  ```
  Para repetir o teste, apague o registro do pedido com `localStorage.removeItem('cvt_gcr_tx')`.
- No Merchant Center: **Crescimento → Avaliações do cliente** (os opt-ins aparecem em até alguns dias).
