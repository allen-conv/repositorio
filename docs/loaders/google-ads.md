# google-ads.js

**Ponte de conversões do Google Ads.** Escuta o dataLayer da loja e, para cada evento configurado, faz push de um evento-ponte `gads_conversion` com ID, label, `value`, `currency` e `transaction_id`. Quem dispara a conversão é uma tag do GTM acionada por esse evento.

- URL: `https://cdn.jsdelivr.net/gh/allen-conv/repositorio@main/google-ads.js`
- Avisa no console (em debug) quando um `purchase` chega sem `transaction_id` (risco de duplicidade).

## Configuração (antes do script)
```js
window.GADS_CONFIG = {
  conversionId: 'AW-XXXXXXXXX',
  sendTo: { purchase: 'LABEL_COMPRA', add_to_cart: 'LABEL_ATC' }, // evento do dataLayer -> label
  debug: false
};
```
Sem `conversionId` ou `sendTo`, o script não inicia.

## No GTM
- Acionador: evento personalizado `gads_conversion`.
- Tag de conversão do Google Ads usando as variáveis `gads_conversion_id`, `gads_conversion_label`, `value`, `currency`, `transaction_id`.
- `gads_source_event` informa qual evento originou a conversão.

## Lojas que usam
Ver [lojas.md](../lojas.md).
