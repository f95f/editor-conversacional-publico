# Editor de Conversas

Editor visual de fluxos conversacionais em Angular e TypeScript. Permite criar blocos de fala, conectar respostas e exportar documentos no formato `.flow.json`.

## Funcionalidades

- Mapa com criação, edição, seleção e organização de blocos e conexões.
- Modo Foco para trabalhar em um bloco por vez.
- Modo Percurso para navegar pelos caminhos da conversa.
- Desfazer/refazer, copiar/colar e controles de zoom e tema.
- Lista lateral de fluxos com salvamento automático neste navegador.
- Importação e exportação de arquivos `.flow.json`.

Os exemplos distribuídos são genéricos e usam campos como `{{cliente_nome}}` e `{{agente_nome}}`. Esses campos são texto literal; o editor não consulta serviços externos nem executa regras de atendimento.

## Executar localmente

Use Node.js 22.12 ou superior na linha 22, ou Node.js 24, e npm.

```sh
npm ci
npm start
```

Abra `http://localhost:4200/`.

## Validar e gerar o site

```sh
npm test -- --watch=false
npm run build
```

O site estático é gerado em `dist/editor-conversacional/browser`. O build usa caminhos relativos para funcionar em um subdiretório do GitHub Pages.

## Publicar no GitHub Pages

O workflow `.github/workflows/pages.yml` testa, compila e publica somente a pasta do site.

1. No repositório, abra **Settings > Pages**.
2. Em **Build and deployment > Source**, selecione **GitHub Actions**.
3. Abra **Actions > Deploy GitHub Pages > Run workflow**, selecione `main` e execute.

Execute o workflow novamente para publicar atualizações. Ele usa o token temporário do GitHub Actions e não requer tokens pessoais no código. Veja a [documentação do GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Armazenamento local

As edições e o último fluxo selecionado são restaurados ao reabrir a página. Os dados ficam no navegador e endereço usados para acessar o editor. Limpar os dados do site remove os fluxos locais; use **Exportar** para guardar cópias em arquivo.

Este aplicativo é estático e não inclui servidor de armazenamento ou sincronização de fluxos entre dispositivos.

## Formato dos documentos

Consulte o schema em `contracts/flow.schema.json`, os tipos em `contracts/flow-contracts.ts` e o [guia de criação de fluxos](doc/instrucoes-agentes-flow-json.md). Os arquivos em `examples/` podem ser abertos pelo botão **Abrir**.
