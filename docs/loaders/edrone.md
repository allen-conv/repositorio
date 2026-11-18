# edrone-loader.min.js

Integração com a **Edrone** (CRM e automação de marketing). Carrega a Edrone e envia as ações da loja a partir do dataLayer da Convertr.

- URL: `https://cdn.jsdelivr.net/gh/allen-conv/repositorio@main/edrone-loader.min.js`
- Ações observadas no código: `product_view`, `category_view`, `add_to_cart`, `order`, `subscribe`.

## Configuração (antes do script)
| Variável | Obrigatória | Uso |
|---|---|---|
| `window.edrone_app_id` | sim | App ID da Edrone |
| `window.edrone_store_id` | não | ID da loja; se ausente, tenta `sessionStorage` e o estado do Nuxt (`__NUXT__`) |
| `window.edrone_debug` | não | logs no console |

## Instalação (GTM)
```html
<script>
  window.edrone_app_id = 'APP_ID';
</script>
<script src="https://cdn.jsdelivr.net/gh/allen-conv/repositorio@main/edrone-loader.min.js" async></script>
```

## Grava no navegador
localStorage e sessionStorage (cache de IDs/estado). A completar.

## Lojas que usam
Ver [lojas.md](../lojas.md).
