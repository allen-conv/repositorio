# Scripts Convertr — cvt-user-data-loader

Loader único para lojas Convertr. Ele capta os dados que o próprio cliente informa durante a navegação, normaliza no padrão de cada plataforma, aplica SHA-256 e salva no `localStorage` (`cvt_ud`). Assim esses dados podem ser reaproveitados em Google Ads/GA4, Meta, Pinterest e TikTok sem acionadores por formulário ou clique.

## O que ele capta (sem acionadores)

| Fonte | Como | Exemplos na Convertr |
|---|---|---|
| Formulários | escuta global de `change`, `focusout` e `submit` (fase de captura) | newsletter (`newsletter:name`, `newsletter:email`), login (`username` só se for e-mail), cadastro, CEP |
| dataLayer nativo | intercepta `dataLayer.push` e lê o histórico | `eventModel.customer.{email, phone, first_name, last_name, city, region}` dos eventos do checkout |
| API da loja/checkout | intercepta `fetch`/XHR do **mesmo domínio** em `/api/` e `/checkout-api/` | `/checkout-api/auth/customers/me`, criação de endereço, identificação no checkout |
| Legado | migra `user_data` / `meta_user_data` (tentativa anterior via GTM) | — |

Para objetos (dataLayer/API), só aceita algo que claramente é uma pessoa ou um endereço (tem e-mail, telefone, ou CEP + cidade/nome). Isso evita confundir `name` de produto com nome de cliente.

## O que é salvo

```json
{ "v":1, "ts":..., "exp":...,
  "h": { "em","em_g","ph","ph_e164","fn","ln","ct","st","zp","country","external_id" },   // SHA-256 hex
  "g": { "city":"são paulo", "region":"SP", "postal_code":"01310100", "country":"BR" }     // texto (o Google exige esses 4 sem hash)
}
```

**Nunca captado nem salvo:** CPF/CNPJ (`taxvat`), RG, nascimento, senha, cartão, cupom, rua, número, complemento e bairro. E-mail, telefone e nome **nunca** ficam em texto puro.
Validade: 180 dias (configurável). Só altera o storage quando algum valor muda.

### Normalização aplicada
- E-mail: trim + minúsculas. Para gmail, também gera `em_g` sem os pontos antes do @ (regra do Google).
- Telefone: só dígitos com DDI 55 (`ph`, para Meta e Pinterest) e E.164 com `+` (`ph_e164`, para Google e TikTok).
- Nome: minúsculas, sem pontuação, acentos mantidos (UTF-8). Nome completo é dividido em nome e sobrenome.
- Cidade (Meta): minúsculas sem espaços. UF: 2 letras. CEP: 8 dígitos. País: `br`.

## Instalação nas lojas

O arquivo é servido direto deste repositório pelo jsDelivr:

```
https://cdn.jsdelivr.net/gh/allen-conv/repositorio@main/cvt-user-data-loader.min.js
```

Em cada loja, **uma única vez**, coloque uma tag HTML personalizado no GTM com acionador **Initialization - All Pages** (o GTM carrega na loja **e** no checkout `/checkout`, que é um app separado):

```html
<script>
  window.cvtUDConfig = { ttlDays: 180, autoGtag: true };
</script>
<script src="https://cdn.jsdelivr.net/gh/allen-conv/repositorio@main/cvt-user-data-loader.min.js" async></script>
```

Consentimento (LGPD): hash é dado pseudonimizado, não anônimo. Na tag, em *Configurações avançadas → Consentimento*, exija `ad_user_data` (ou condicione ao aceite da CMP da loja).

### Opções (`window.cvtUDConfig`)
| Opção | Padrão | Uso |
|---|---|---|
| `ttlDays` | 180 | validade dos dados |
| `autoGtag` | true | chama `gtag('set','user_data', …)` sozinho (pega a tag do Google nativa da Convertr) |
| `purgeLegacy` | false | apaga `user_data` / `meta_user_data` em texto puro depois de migrar (ver aviso sobre o `meta-pixel-loader.js`) |
| `legacyKeys` | `['user_data','meta_user_data']` | chaves antigas a migrar |
| `apiPattern` | regex `/api/` e `/checkout-api/` | endpoints observados |
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

## Uso nas plataformas

API global: `window.cvtUserData`
- `.google()` → `{sha256_email_address, sha256_phone_number, address:{sha256_first_name, sha256_last_name, city, region, postal_code, country}}`
- `.meta()` → `{em, ph, fn, ln, ct, st, zp, country, external_id}`
- `.tiktok()` → `{email, phone_number, external_id}`
- `.pinterest()` → `{em}`
- `.has()`, `.get()`, `.onChange(fn)`, `.ingest({...}, 'origem')`, `.clear()`

Também faz push de `{event:'cvt_user_data', cvt_user_data:{google, meta, tiktok, pinterest}}` no dataLayer no carregamento (quando já existe dado) e a cada atualização.

### Variáveis no GTM (substituem as ~30 variáveis LS/cookie/consulta)
```js
// CJS - UD Google
function(){ return window.cvtUserData && cvtUserData.google(); }
// CJS - UD Meta
function(){ return window.cvtUserData && cvtUserData.meta(); }
// CJS - UD TikTok
function(){ return window.cvtUserData && cvtUserData.tiktok(); }
// CJS - UD Pinterest
function(){ return window.cvtUserData && cvtUserData.pinterest(); }
```
- **Google Ads / GA4:** variável *Dados fornecidos pelo usuário* → modo **Código** → `{{CJS - UD Google}}`, ligada à Tag do Google ("Incluir dados fornecidos pelo usuário"). Ative a coleta de dados fornecidos pelo usuário no GA4 e nas conversões otimizadas do Ads. Com `autoGtag: true`, o gtag nativo da plataforma também recebe os dados.
- **Meta:** `fbq('init', '{{C - Meta Pixel}}', {{CJS - UD Meta}} || {});` na tag base (o pixel aceita valores já em SHA-256). Para CAPI via sGTM ou app, envie os mesmos campos em `user_data`.
- **TikTok:** `ttq.identify({{CJS - UD TikTok}} || {});` antes dos eventos.
- **Pinterest:** `pintrk('load', '{{C - Pinterest}}', {{CJS - UD Pinterest}} || {});`

Como as variáveis leem o storage na hora, qualquer tag que dispara depois que o usuário digitou já recebe os dados, inclusive em páginas seguintes.

## ⚠️ Conflito com o `meta-pixel-loader.js` deste repositório
O `meta-pixel-loader.js` grava `meta_user_data` em **texto puro** (e-mail, telefone, nome e **CPF**) e usa o CPF como `external_id`. Enquanto ele estiver assim:
- não use `purgeLegacy: true` (um apaga e o outro regrava);
- o ideal é o `meta-pixel-loader.js` passar a ler `window.cvtUserData.meta()` no `fbq('init', …)` e parar de gravar `meta_user_data`.

## Limpeza recomendada na Hocks (GTM-529TNFG8)
- Excluir as tags pausadas `user_data - customer_inputs`, `user_data - input - adress checkout`, `user_data - select - adress checkout` e `user_data - update_local_storage`, e os acionadores *Botão News*, *Botão - Cadastrar - Adicionar Endereço*, *Seleção endereço checkout*.
- Substituir as variáveis `LS - *`, `consulta-*`, `cookie-*`, `datalayer - *` e `JS - phone` pelas 4 `CJS - UD *` e pela variável "Conversões Otimizadas" em modo código.
- `meta_user_data` com CPF em texto puro vem do `meta-pixel-loader.js` (seção acima).

## Teste
- Console: `cvtUserData.get()` depois de preencher a newsletter ou o login; `localStorage.cvt_ud`.
- Tag Assistant: evento `cvt_user_data` e variáveis `CJS - UD *` preenchidas; no hit do Ads/GA4, parâmetro `em`/user data presente.
- Meta Pixel Helper: "Advanced Matching" com os parâmetros.
- Roteiro: newsletter → login → checkout (identificação, endereço) → compra → nova sessão (os dados continuam lá).
