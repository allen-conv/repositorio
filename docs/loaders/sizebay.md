# sizebay-loader.min.js

Integração com o **provador virtual Sizebay**: carrega o script oficial (`vfr-v3-production.sizebay.technology/V4/implantation/index.js`), se ele ainda não estiver na página, e acompanha `view_item`, `add_to_cart` e `purchase` do dataLayer.

- URL: `https://cdn.jsdelivr.net/gh/allen-conv/repositorio@main/sizebay-loader.min.js`

## Configuração (antes do script)
| Variável | Obrigatória | Uso |
|---|---|---|
| `window.sizebay_tenant_id` | sim | tenant da loja na Sizebay; sem ele o script não inicia |
| `window.sizebay_country` | não | padrão `BR` |
| `window.sizebay_send_cart` | não | envio de carrinho |
| `window.sizebay_debug` | não | logs no console |

## Grava no navegador
localStorage: `sizebay_permalinks`, `sizebay_item_meta`, `sizebay_orders_sent`, `sizebay_orders_pending` (controle de pedidos já enviados).

## Lojas que usam
Ver [lojas.md](../lojas.md).
