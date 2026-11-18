# meta-pixel-loader.js

**Meta Pixel completo** a partir do dataLayer da Convertr: carrega o `fbevents.js`, inicializa o pixel com Advanced Matching, dispara `PageView` e mapeia os eventos de e-commerce, com deduplicação.

- URL: `https://cdn.jsdelivr.net/gh/allen-conv/repositorio@main/meta-pixel-loader.js`

| Evento da loja | Evento Meta |
|---|---|
| `view_item` | ViewContent |
| `add_to_cart` | AddToCart |
| `initiate_checkout` | InitiateCheckout (não usa `begin_checkout`, que vem sem IDs de produto) |
| `add_shipping_info` | AddShippingInfo |
| `add_payment_info` | AddPaymentInfo |
| `purchase` | Purchase (uma vez por `transaction_id`) |
| `login_success` | não dispara; só alimenta os dados do usuário |

## Configuração (antes do script)
| Variável | Obrigatória | Uso |
|---|---|---|
| `window.meta_pixel_id` | sim | ID do pixel; sem ele o script não inicia |
| `window.meta_debug` | não | logs no console |
| `window.meta_skip_openbridge` | não | desativa o OpenBridge para o pixel |
| `window.meta_disable_event_id` | não | `true` = não envia eventID |
| `window.meta_dedupe_window_ms` | não | janela de deduplicação de eventos |

Helpers de debug: `window.meta_pixel_debug_dump()` e `window.meta_pixel_debug_clear()`.

## Grava no navegador
⚠️ `localStorage.meta_user_data` em **texto puro**: e-mail, nome, telefone, **CPF (taxvat)**, cidade, UF, CEP e país. O CPF é usado como `external_id`. Recomendação: ler os dados com hash do [cvt-user-data](cvt-user-data.md) e parar de gravar `meta_user_data`.

## Lojas que usam
Ver [lojas.md](../lojas.md).
