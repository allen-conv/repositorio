# b2b-events-loader

Eventos extras das lojas **B2B (atacado)** da Convertr, detectados no site e já enviados para o **GA4** e o **Meta**, sem tags nem acionadores no GTM.

Substitui a pasta **"Eventos B2B - Login"** do GTM (exemplo: Sol Jeans B2B, `GTM-WKQKJF7B`):
- a tag HTML `Eventos Datalayer - login`, que criava os eventos no dataLayer;
- as tags `GA4 - b_ver_preco`, `GA4 - b_registrar_pt1` e `GA4 - b_registrar_pt2`;
- os acionadores `Evento - b_ver_preco`, `Evento - login_start`, `Evento - sign_up` e a variável `DTL - trigger`.

## Eventos detectados

| Evento | Quando | Parâmetros |
| --- | --- | --- |
| `begin_login` | Abriu o pop-up de cadastro/login ou entrou em `/login` | `trigger`, `source` |
| `ver_preco` | O mesmo, quando a origem foi o botão "ver preço" | `trigger`, `source` |
| `login_start` | Informou o e-mail/CNPJ (resposta da API `check_exists`). Uma vez a cada abertura do pop-up | `source` |
| `sign_up` | Cadastro criado (`POST api/customer/customers` com sucesso) | `source` |
| eventos próprios | Clique num seletor (`clicks`) ou chamada de API (`api`) | os que você definir |

- `trigger`: `ver_preco`, `header_criar_conta`, `vitrine` ou `unknown`.
- `source`: `home`, `product` (URL terminada em `/p`), `category` (`/c`) ou o caminho da página.
- Chamadas de API com erro (4xx/5xx) não contam.

## Instalação

Uma tag HTML personalizado no GTM, com acionador **Initialization - All Pages**:

```html
<script>
  window.cvtB2bConfig = {
    ga4: 'G-XXXXXXXXXX',
    metaPixelId: '1234567890',
    events: {
      ver_preco:   { ga4: 'b_ver_preco',     meta: 'VerPreco' },
      login_start: { ga4: 'b_registrar_pt1', meta: 'IniciouCadastro' },
      sign_up:     { ga4: 'b_registrar_pt2', meta: 'CompleteRegistration' }
    }
  };
</script>
<script src="https://allen-conv.github.io/repositorio/b2b-events-loader.min.js" async></script>
```

Sem `events`, o loader usa exatamente esse mapeamento, que reproduz os nomes de GA4 do GTM atual.

**Antes de ativar, pause a pasta "Eventos B2B - Login" do GTM**, senão os eventos contam em dobro no GA4.

## Opções (`window.cvtB2bConfig`)

| Opção | Padrão | Para que serve |
| --- | --- | --- |
| `ga4` | — | G- que recebe os eventos. Sem ele, nada vai para o GA4 |
| `metaPixelId` | — | Pixel que recebe os eventos. Sem ele, nada vai para o Meta |
| `events` | mapeamento acima | Evento detectado → `{ ga4: 'nome', meta: 'Nome', extra: {...} }`. `false` ou ausente = não envia para aquele destino |
| `params` | `true` | Envia `trigger` e `source` junto |
| `dataLayer` | `false` | Também faz `dataLayer.push({event, trigger, source})`, para usar no GTM durante a transição |
| `clicks` | `[]` | Eventos por clique: `[{ selector: '.btn-whats', event: 'whatsapp', params: { local: 'pdp' } }]` |
| `api` | `[]` | Eventos por chamada de API: `[{ url: 'api/...', method: 'POST', event: 'nome', once: true }]` |
| `selectors` | tema padrão | Troca os seletores do tema: `verPreco`, `criarConta`, `vitrine`, `popup`, `popupContent` |
| `debug` | `false` | Mostra no console cada evento detectado e enviado (`[cvt-b2b] …`) |

### Meta: padrão × personalizado

Nomes da lista de eventos padrão do Meta (`CompleteRegistration`, `Lead`, `Contact`, `SubmitApplication` etc.) saem como **evento padrão**. Qualquer outro nome sai como **evento personalizado**. O envio usa `trackSingle`/`trackSingleCustom`, só para o pixel configurado, mesmo que a página tenha outros pixels.

## Como envia

- **GA4**, nesta ordem:
  1. se o [ga4-loader](ga4-loader.md) estiver na página com o **mesmo G-**, usa a instância dele;
  2. se o G- **já estiver carregado na página** (GA4 nativo da plataforma ou do GTM, que é o caso mais comum), envia pelo `gtag` principal com `send_to`. O Google aceita só uma instância por ID, então uma instância própria com o mesmo G- seria ignorada. As chaves `items`, `ecommerce` e `eventModel`, que o GTM/tema da Convertr acrescenta a todo comando gtag, ficam protegidas e não chegam ao GA4;
  3. senão, cria uma instância própria do gtag (dataLayer `cvtB2bDataLayer`), sem `page_view`, com o Consent Mode da loja espelhado.
- O `source` é a página **onde o clique aconteceu** (ex.: `home`), mesmo quando o botão leva para `/login`.
- **Meta:** se o [meta-ads-loader](meta-ads-loader.md) estiver na página com o mesmo pixel, só envia os eventos. Senão, carrega o pixel e faz o `init` (com Advanced Matching do [cvt-user-data](cvt-user-data.md)), **sem `PageView`**.

## Testar

Com `debug: true`:
1. Clique em "ver preço": o console mostra `[cvt-b2b] GA4 b_ver_preco …` e `[cvt-b2b] Meta trackSingleCustom VerPreco …`.
2. Informe o e-mail/CNPJ no pop-up: `b_registrar_pt1` / `IniciouCadastro`, uma vez só.
3. Conclua o cadastro: `b_registrar_pt2` / `CompleteRegistration`.
4. Confira no GA4 (DebugView/Tempo real) e no Gerenciador de Eventos do Meta (Testar eventos).

Para disparar um evento manualmente: `cvtB2b.fire('sign_up', { teste: 1 })`.

## Cuidados

- **Seletores do tema:** a detecção do clique e do pop-up depende das classes do tema B2B (`register__show-price-btn-default`, `go__create-account`, `.overlay.visible` + `.big-wrapper`). Se a loja usar outro tema, ajuste `selectors`.
- No GA4, para ver `trigger` e `source` nos relatórios, crie as dimensões personalizadas (escopo de evento).
