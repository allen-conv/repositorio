# Scripts Convertr — cvt-user-data-loader

Loader único para lojas Convertr que **só captura, padroniza e armazena** os dados que o próprio cliente informa durante a navegação. Os dados ficam no `localStorage` (`cvt_ud`), com hash SHA-256.

**Ele não envia nada para nenhuma plataforma.** Usar esses dados (Google Ads/GA4, Meta, Pinterest, TikTok, CAPI etc.) é responsabilidade de outros scripts ou tags do GTM, que leem o storage.

## O que ele capta (sem acionadores)

| Fonte | Como | Exemplos na Convertr |
|---|---|---|
| Formulários | escuta global de `change`, `focusout` e `submit` (fase de captura) | newsletter (`newsletter:name`, `newsletter:email`), login (`username` só se for e-mail), cadastro, CEP |
| dataLayer nativo | lê o histórico e os novos `dataLayer.push` (só leitura, não faz push) | `eventModel.customer.{email, phone, first_name, last_name, city, region}` dos eventos do checkout |
| API da loja/checkout | lê respostas de `fetch`/XHR do **mesmo domínio** em `/api/` e `/checkout-api/` | `/checkout-api/auth/customers/me`, criação de endereço, identificação no checkout |
| Legado | migra `user_data` / `meta_user_data` (tentativa anterior via GTM) | — |

Em objetos (dataLayer/API), só aceita algo que claramente é uma pessoa ou um endereço (tem e-mail, telefone, ou CEP + cidade/nome). Isso evita confundir `name` de produto com nome de cliente.

**Nunca captado nem salvo:** CPF/CNPJ (`taxvat`), RG, nascimento, senha, cartão, cupom, rua, número, complemento e bairro. E-mail, telefone e nome **nunca** ficam em texto puro.

## O que é salvo (`localStorage.cvt_ud`)

```json
{
  "v": 2,
  "updated_at": 1795000000000,
  "expires_at": 1810552000000,
  "hashed": {
    "email": "<sha256>",
    "email_gmail": "<sha256>",
    "phone": "<sha256>",
    "phone_e164": "<sha256>",
    "first_name": "<sha256>",
    "last_name": "<sha256>",
    "city": "<sha256>",
    "region": "<sha256>",
    "postal_code": "<sha256>",
    "country": "<sha256>",
    "customer_id": "<sha256>"
  },
  "plain": { "city": "são paulo", "region": "sp", "postal_code": "01310100", "country": "br" }
}
```

Os campos só aparecem quando foram captados. A validade é de 180 dias (configurável), e o storage só é regravado quando algum valor muda. `plain` traz apenas dados de localização não sensíveis, já normalizados, para quem precisar deles sem hash (ex.: o Google exige cidade, UF, CEP e país sem hash).

### Padronização antes do hash
| Campo | Valor normalizado (antes do SHA-256) |
|---|---|
| `email` | trim + minúsculas: `maria@exemplo.com` |
| `email_gmail` | só para gmail/googlemail, sem pontos antes do @: `joaosilva@gmail.com` |
| `phone` | só dígitos com DDI 55: `5547999998888` |
| `phone_e164` | E.164 com `+`: `+5547999998888` |
| `first_name` / `last_name` | minúsculas, sem pontuação, acentos mantidos; nome completo é dividido |
| `city` | minúsculas, sem espaços: `sãopaulo` (em `plain`: `são paulo`) |
| `region` | UF com 2 letras minúsculas: `sp` (aceita nome do estado) |
| `postal_code` | 8 dígitos: `01310100` |
| `country` | ISO de 2 letras minúsculas: `br` |
| `customer_id` | ID do cliente na loja (quando logado) |

Cada plataforma pede um formato ligeiramente diferente (ex.: Google usa `phone_e164`, Meta usa `phone`). Quem consome escolhe o campo certo.

## Leitura por outros scripts e tags

```js
// direto do storage (funciona mesmo antes do loader carregar)
var ud = JSON.parse(localStorage.getItem('cvt_ud') || 'null');

// ou pela API global
window.cvtUserData.get();       // cópia do objeto salvo
window.cvtUserData.has();       // true se já há e-mail ou telefone
window.cvtUserData.onChange(function (ud) { /* chamado quando o storage é atualizado */ });
window.cvtUserData.ingest({ email: '...', phone: '...' }, 'origem'); // captura manual
window.cvtUserData.clear();     // apaga os dados
```

Exemplo de variável JS no GTM:
```js
function(){ try { return JSON.parse(localStorage.getItem('cvt_ud')).hashed.email; } catch(e){ return undefined; } }
```

## Instalação nas lojas

O arquivo é servido direto deste repositório pelo jsDelivr:

```
https://cdn.jsdelivr.net/gh/allen-conv/repositorio@main/cvt-user-data-loader.min.js
```

Em cada loja, **uma única vez**, coloque uma tag HTML personalizado no GTM com acionador **Initialization - All Pages**. O GTM carrega na loja **e** no checkout (`/checkout`, que é um app separado):

```html
<script>
  window.cvtUDConfig = { ttlDays: 180 };
</script>
<script src="https://cdn.jsdelivr.net/gh/allen-conv/repositorio@main/cvt-user-data-loader.min.js" async></script>
```

Consentimento (LGPD): hash é dado pseudonimizado, não anônimo. Na tag, em *Configurações avançadas → Consentimento*, exija `ad_user_data` (ou condicione ao aceite da CMP da loja).

### Opções (`window.cvtUDConfig`)
| Opção | Padrão | Uso |
|---|---|---|
| `ttlDays` | 180 | validade dos dados |
| `purgeLegacy` | false | apaga `user_data` / `meta_user_data` em texto puro depois de migrar (ver aviso sobre o `meta-pixel-loader.js`) |
| `legacyKeys` | `['user_data','meta_user_data']` | chaves antigas a migrar |
| `apiPattern` | regex `/api/` e `/checkout-api/` | endpoints observados |
| `storageKey` | `cvt_ud` | nome da chave no localStorage |
| `debug` | false | log `[cvt-ud]` no console |

## Como editar e publicar (vale para todas as lojas)

1. Edite **somente** `src/cvt-user-data/cvt-user-data-loader.js` (pelo GitHub mesmo ou localmente).
2. Ao fazer commit na `main`, a Action **cvt-user-data - build, testes e publicação**:
   - roda os testes no fonte e no minificado (`test/cvt-user-data.test.js`);
   - gera `cvt-user-data-loader.min.js` na raiz e commita;
   - limpa o cache do jsDelivr `@main`. Em poucos minutos, todas as lojas passam a carregar a versão nova.
3. Se um teste falhar, o `.min.js` não é atualizado e as lojas continuam na versão anterior. Veja o erro na aba Actions.
4. Para mudanças maiores, abra um PR: a Action roda os testes no PR sem publicar.

Localmente: `npm install` e depois `npm run ci`.

> Toda alteração na `main` vai para **todas** as lojas na hora. Se quiser um canal de homologação, use uma branch `beta` numa loja de teste (`…/repositorio@beta/cvt-user-data-loader.min.js`) antes do merge.
> Mudanças no formato do `cvt_ud` quebram quem lê o storage: nesse caso suba o `v` e avise quem consome.

## ⚠️ Conflito com o `meta-pixel-loader.js` deste repositório
O `meta-pixel-loader.js` grava `meta_user_data` em **texto puro** (e-mail, telefone, nome e **CPF**). Enquanto ele estiver assim, não use `purgeLegacy: true` (um apaga e o outro regrava). O ideal é ele passar a ler o `cvt_ud` e parar de gravar `meta_user_data`.

## Teste
- Console: `cvtUserData.get()` depois de preencher a newsletter ou o login; `localStorage.cvt_ud`.
- Roteiro: newsletter → login → checkout (identificação, endereço) → compra → nova sessão (os dados continuam lá).
