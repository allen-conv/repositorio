# cvt-user-data-loader

Loader único para lojas Convertr que **só captura, padroniza e armazena** os dados que o próprio cliente informa durante a navegação. Os dados ficam disponíveis para outros scripts e tags reaproveitarem: padronizados e legíveis (`data`) e também em SHA-256 (`hashed`), no formato pedido pelas plataformas de anúncio.

**Ele não envia nada para nenhuma plataforma.** Usar esses dados (Google Ads/GA4, Meta, Pinterest, TikTok, CAPI, CRM etc.) é responsabilidade de outros scripts ou tags do GTM.

## Onde grava: depende do consentimento

| Situação | Onde fica `cvt_ud` | Duração |
|---|---|---|
| Visitante aceitou as políticas do site | `localStorage` | sessões futuras, até 180 dias |
| Ainda não aceitou / recusou | `sessionStorage` | só a sessão atual (fecha a aba, some) |
| Aceitou no meio da sessão | dados da sessão passam para o `localStorage` | — |
| Aceite expirou ou foi retirado | dados saem do `localStorage` e voltam para a sessão | — |

Assim, quem preencheu um formulário e continuou navegando tem os dados disponíveis nos eventos seguintes da mesma sessão, mesmo sem login e sem aceite. Só com aceite eles ficam para as próximas visitas.

**Como o consentimento é detectado** (`consent: 'auto'`, padrão):
1. **Banner LGPD da Convertr**: o tema guarda o aceite em `$nuxt.$store.state.lgpd.lgpd.expire_at` (fica `null` até o clique em "Estou de acordo"). O loader acompanha esse estado e, quando há aceite, grava a marca `localStorage.cvt_consent = {"granted":true,"expire_at":...}`, que é usada no checkout (outro app, sem esse estado).
2. **Consent Mode do Google**: `ad_user_data` (ou `ad_storage`) `granted`/`denied` no dataLayer.
3. Sem nenhum dos dois: considera **sem consentimento** (sessionStorage).

Também aceita `consent: true`, `consent: false` ou uma função `consent: function(){ return ...; }` para lojas com outra CMP.

## O que ele capta (sem acionadores)

| Fonte | Como | Exemplos na Convertr |
|---|---|---|
| Formulários | escuta global de `change`, `focusout` e `submit` (fase de captura) | newsletter (`newsletter:name`, `newsletter:email`), login (`username` só se for e-mail), cadastro, CEP |
| dataLayer nativo | lê o histórico e os novos `dataLayer.push` (só leitura, não faz push) | `eventModel.customer.{email, phone, first_name, last_name, city, region}` dos eventos do checkout |
| API da loja/checkout | lê respostas de `fetch`/XHR do **mesmo domínio** em `/api/` e `/checkout-api/` | `/checkout-api/auth/customers/me`, criação de endereço, identificação no checkout |
| Legado | migra `user_data` / `meta_user_data` (tentativa anterior via GTM) | — |

Em objetos (dataLayer/API), só aceita algo que claramente é uma pessoa ou um endereço (tem e-mail, telefone, ou CEP + cidade/nome). Isso evita confundir `name` de produto com nome de cliente.

**Nunca captado nem salvo:** CPF/CNPJ (`taxvat`), RG, nascimento, senha, cartão, cupom, rua, número, complemento e bairro.

## O que é salvo (`cvt_ud`)

```json
{
  "v": 3,
  "updated_at": 1795000000000,
  "expires_at": 1810552000000,
  "consent": true,
  "storage": "local",
  "data": {
    "email": "maria@exemplo.com",
    "phone": "5547999998888",
    "phone_e164": "+5547999998888",
    "first_name": "maria",
    "last_name": "clara souza",
    "city": "são paulo",
    "region": "sp",
    "postal_code": "01310100",
    "country": "br",
    "customer_id": "98765"
  },
  "hashed": {
    "email": "<sha256>", "email_gmail": "<sha256>", "phone": "<sha256>", "phone_e164": "<sha256>",
    "first_name": "<sha256>", "last_name": "<sha256>", "city": "<sha256>", "region": "<sha256>",
    "postal_code": "<sha256>", "country": "<sha256>", "customer_id": "<sha256>"
  }
}
```

Os campos só aparecem quando foram captados. O storage só é regravado quando algum valor muda.

### Padronização
| Campo | `data` (legível) | `hashed` = SHA-256 de |
|---|---|---|
| `email` | trim + minúsculas: `maria@exemplo.com` | o mesmo valor |
| `email_gmail` | — | gmail/googlemail sem pontos antes do @: `joaosilva@gmail.com` |
| `phone` | só dígitos com DDI 55: `5547999998888` | o mesmo valor |
| `phone_e164` | `+5547999998888` | o mesmo valor |
| `first_name` / `last_name` | minúsculas, sem pontuação, com acentos; nome completo é dividido | o mesmo valor |
| `city` | minúsculas: `são paulo` | sem espaços: `sãopaulo` |
| `region` | UF minúscula: `sp` (aceita nome do estado) | o mesmo valor |
| `postal_code` | 8 dígitos: `01310100` | o mesmo valor |
| `country` | `br` | o mesmo valor |
| `customer_id` | ID do cliente na loja (quando logado) | o mesmo valor |

Cada plataforma pede um formato ligeiramente diferente (ex.: Google usa `phone_e164`, Meta usa `phone`). Quem consome escolhe o campo certo.

## Leitura por outros scripts e tags

```js
// direto do storage (funciona mesmo antes do loader carregar): procure nos dois
var ud = JSON.parse(localStorage.getItem('cvt_ud') || sessionStorage.getItem('cvt_ud') || 'null');
ud && ud.data.email;          // "maria@exemplo.com"
ud && ud.hashed.phone_e164;   // sha256 de "+5547999998888"

// ou pela API global
window.cvtUserData.get();       // cópia do objeto atual
window.cvtUserData.has();       // true se já há e-mail ou telefone
window.cvtUserData.consent();   // true se há consentimento (dados no localStorage)
window.cvtUserData.onChange(function (ud) { /* chamado quando os dados mudam */ });
window.cvtUserData.ingest({ email: '...', phone: '...' }, 'origem'); // captura manual
window.cvtUserData.clear();     // apaga dos dois storages
```

Exemplo de variável JS no GTM:
```js
function(){ try { return JSON.parse(localStorage.getItem('cvt_ud') || sessionStorage.getItem('cvt_ud')).data.email; } catch(e){ return undefined; } }
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

Consentimento (LGPD): o próprio loader decide onde grava conforme o aceite (ver acima). E-mail, telefone e nome são dados pessoais: a política de privacidade da loja deve mencionar esse uso.

### Opções (`window.cvtUDConfig`)
| Opção | Padrão | Uso |
|---|---|---|
| `ttlDays` | 180 | validade dos dados no localStorage |
| `consent` | `'auto'` | `'auto'`, `true`, `false` ou `function(){}` (ver acima) |
| `purgeLegacy` | false | apaga `user_data` / `meta_user_data` em texto puro depois de migrar (ver aviso sobre o `meta-pixel-loader.js`) |
| `legacyKeys` | `['user_data','meta_user_data']` | chaves antigas a migrar |
| `apiPattern` | regex `/api/` e `/checkout-api/` | endpoints observados |
| `storageKey` | `cvt_ud` | nome da chave no localStorage |
| `debug` | false | log `[cvt-ud]` no console |

## Como editar e publicar (vale para todas as lojas)

1. Edite **somente** `src/cvt-user-data/cvt-user-data-loader.js` (pelo GitHub mesmo ou localmente).
2. Ao fazer commit na `main`, a Action **cvt-user-data - build, testes e publicação**:
   - roda os testes no fonte e no minificado (`src/cvt-user-data/cvt-user-data.test.js`);
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
- Console: `cvtUserData.get()` depois de preencher a newsletter ou o login; `sessionStorage.cvt_ud` (sem aceite) ou `localStorage.cvt_ud` (com aceite).
- Aceite no banner: antes do clique os dados ficam em `sessionStorage`; depois do clique em "Estou de acordo" passam para o `localStorage`.
- Roteiro: newsletter → login → checkout (identificação, endereço) → compra → nova sessão (os dados continuam lá).
