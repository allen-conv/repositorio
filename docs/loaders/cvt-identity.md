# cvt-identity-loader (TESTE)

Loader experimental para medir quanto dá para reconhecer o mesmo visitante **sem login e sem envolver a plataforma**. Está só na branch `teste-identidade` e deve rodar só na loja de teste (`loja-feminina.convertr.app.br`).

## O que faz
- Gera um ID do aparelho (`cvt_did` = `<uuid>.<criado_em_ms>`) e grava em **cookie first-party (JS)** e no **localStorage**. Se um dos dois sumir, recupera pelo outro. `did_origin` diz de onde veio: `novo`, `cookie+ls`, `cookie`, `ls`, `sessao_promovida`, `cookie+ls_divergente`.
- Sessão (`cvt_sid`, 30 min de inatividade) e número da visita (`cvt_vn`).
- Fingerprint próprio, sem biblioteca externa: `fp_stable` (plataforma, núcleos, memória, toque, tela, fuso, idiomas, WebGL) e `fp_full` (+ canvas, fontes, user agent). `fp_parts` traz 6 caracteres do hash de cada componente, para ver qual mudou.
- Lê `_fbp`, `_fbc`, client_id do `_ga`, `gclid`/`_gcl_aw` e UTMs.
- Lê o token `_cv_t` da URL, guarda e **remove da URL**.
- Lê e-mail e customer_id **só em SHA-256** do `cvt_ud` (precisa do `cvt-user-data-loader`).
- Obtém o IP público no navegador (`get.geojs.io`), porque o proxy do n8n não repassa o IP real.
- Envia `page_view` (carga e troca de rota do Nuxt) e `identify` (quando o `cvt_ud` ganha e-mail/customer_id) para o coletor no n8n, via `sendBeacon`.

## O que não faz
- Não grava dado pessoal em texto puro.
- Sem consentimento: usa só ID de sessão, sem fingerprint, sem IP e sem dados do `cvt_ud`.
- Não envia nada para Meta/Google.

## Instalação (GTM da loja de teste)
Tag HTML personalizado, acionador **Initialization - All Pages**:

```html
<script>
  window.cvtUDConfig = { ttlDays: 180 };
  window.cvtIdentityConfig = { consent: true, debug: false };
</script>
<script src="https://cdn.jsdelivr.net/gh/allen-conv/repositorio@main/cvt-user-data-loader.min.js" async></script>
<script src="https://cdn.jsdelivr.net/gh/allen-conv/repositorio@teste-identidade/cvt-identity-loader.js" async></script>
```

`consent: true` força o modo "com consentimento" (loja de teste, tráfego interno). Em qualquer outra loja, deixar `'auto'`.

## Configuração (`window.cvtIdentityConfig`)
| Opção | Padrão | Uso |
|---|---|---|
| `endpoint` | webhook `cv-identity-test` do n8n | para onde vão os eventos |
| `consent` | `'auto'` | `'auto'`, `true`, `false` ou `function(){}` |
| `fingerprint` | `true` | `false` desliga o fingerprint |
| `ipLookup` | `true` | `false` não consulta o IP público |
| `tokenParam` | `_cv_t` | nome do parâmetro do token |
| `debug` | `false` | log `[cvt-identity]` no console |

## O que grava no navegador
Cookie `cvt_did` (400 dias). localStorage: `cvt_did`, `cvt_vn`, `cvt_tok`. sessionStorage: `cvt_sid`, `cvt_ip`, `cvt_id_last` (e `cvt_did` quando sem consentimento).

## Coletor (n8n)
Workflow **Rastreador | Identidade de visitantes (teste)**:
- `POST /webhook/cv-identity-test` (form-urlencoded, campo `d` com o JSON) → tabela `rastreador_eventos_teste`.
- `GET /webhook/cv-token-test?e=<email>&label=<texto>&url=<destino>` → grava em `rastreador_tokens_teste` e devolve `{ token, link }`.

## Como testar
- `window.cvtIdentity.state()` mostra consentimento, ID do aparelho e fingerprint.
- `window.cvtIdentity.reset()` apaga o ID (simula visitante novo).
- Conferir as linhas na tabela `rastreador_eventos_teste` do n8n.

## Lojas que usam
- loja-feminina.convertr.app.br (teste)
