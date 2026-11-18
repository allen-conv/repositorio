# Convenções

## Regras
1. **Caminho = URL.** Nunca mova nem renomeie um `.js` servido às lojas sem antes trocar o apontamento em todos os GTMs que o usam (ver [lojas.md](lojas.md)). Se precisar mudar, mantenha uma cópia no caminho antigo durante a transição.
2. **Tudo na `main` vai para produção.** Teste antes numa loja de teste usando uma branch (ex.: `…/repositorio@beta/<arquivo>`) e só então faça merge.
3. **Compatibilidade.** Não remova nem renomeie variáveis de configuração (`window.xxx`) que as lojas já usam. Se precisar mudar, aceite o nome antigo e o novo por um tempo.
4. **Um loader = uma responsabilidade.** Ex.: o `cvt-user-data-loader` só captura e armazena; quem envia para as plataformas são outros loaders ou tags.
5. **Dados pessoais.** Não gravar e-mail, telefone, nome ou documento em texto puro no navegador. CPF/CNPJ, senha e cartão não devem ser captados.
6. **Proteção contra carga dupla.** Todo loader deve sair cedo se já tiver sido carregado (ex.: `if (window.__meuLoader) return;`).
7. **Debug desligado por padrão**, ativável por variável (`xxx_debug: true`), com logs prefixados (`[nome-do-loader]`).

## Novo loader
- **Simples (sem build):** crie `<nome>-loader.js` na raiz e uma página em `docs/loaders/<nome>.md`. O `purge-jsdelivr.yml` já limpa o cache a cada push.
- **Com build/testes:** fonte em `src/<nome>/` (código + `*.test.js`), saída `<nome>-loader.min.js` na raiz, scripts `build:<nome>` e `test:<nome>` no `package.json` e um workflow como o `build-user-data.yml`.
- Adicione a linha na tabela do [README](../README.md) e as lojas em [lojas.md](lojas.md).

## Página de cada loader (`docs/loaders/<nome>.md`)
- O que faz e o que **não** faz
- Snippet de instalação no GTM (tag HTML + acionador)
- Variáveis de configuração (nome, padrão, obrigatória?)
- O que grava no navegador (localStorage, cookies)
- Como testar
- Lojas que usam
