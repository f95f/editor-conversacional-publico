# Instrucoes para agentes criarem e editarem `.flow.json`

Este guia e autocontido para facilitar copia para outros agentes e projetos. Use-o para criar ou editar arquivos `.flow.json` completos de fluxos conversacionais em alto nivel. O arquivo descreve somente conversa e layout visual; nao executa regras, scripts, chamadas de API, eventos FSM ou operacoes de uma ferramenta de orquestracao.

O editor aceita arquivos `.json` e `.flow.json` no seletor, mas **so importa documentos que sigam exatamente o contrato v1 abaixo**. A extensao do arquivo nao converte outros formatos automaticamente. Em caso de erro, a abertura e cancelada e o fluxo atual permanece carregado.

## Conceito

- Blocos (`content.nodes`) sao acoes do agente: mensagens, perguntas, explicacoes ou encerramentos.
- Ligacoes (`content.edges`) sao respostas, intencoes ou condicoes vindas do cliente que levam de um bloco a outro.
- `baseMessage` e o texto principal da ligacao. Ele deve ser a mensagem base/intencao do cliente e e o que aparece no fluxograma.
- `description` em blocos ou ligacoes guarda contexto, regra, limite, fonte, inferencia ou lacuna.
- `examples` guarda exemplos de falas do cliente, extraidos da fonte ou criados pelo autor.
- Limites, retries e condicoes sao texto comum em ligacoes/blocos. Nao crie campos logicos para contadores, regras executaveis ou validacoes internas.

## Estrutura obrigatoria

Todo arquivo deve ser um JSON completo com esta forma:

```json
{
  "schemaVersion": 1,
  "document": {
    "id": "fluxo-exemplo",
    "title": "Fluxo exemplo",
    "startNodeId": "n-inicio"
  },
  "content": {
    "nodes": [],
    "edges": []
  },
  "layout": {
    "nodes": {},
    "edges": {},
    "viewport": { "x": 0, "y": 0, "zoom": 1 }
  }
}
```

Campos obrigatorios:

- Raiz: `schemaVersion`, `document`, `content`.
- `schemaVersion`: sempre `1`.
- `schemaVersion` e o numero JSON `1`, nao a string `"1"`, `"1.0.0"` ou `"conversation-flow-v1"`.
- `document`: exige `id` e `title`; `startNodeId` e opcional.
- `content`: exige arrays `nodes` e `edges`.
- Cada node exige `id` e `title`; pode ter `description` e `message`.
- Cada edge exige `id`, `source`, `target` e `baseMessage`; pode ter `description` e `examples`.

Campos proibidos no contrato atual:

- Nao use `document.description`.
- Nao use `edge.label`.
- Nao use `edge.key`.
- Nao use `null`.
- Nao inclua campos desconhecidos, referencias a scripts, ids de nos da orquestracao, nomes de secoes externas ou metadados tecnicos (por exemplo, `metadata` na raiz).

## Campos

### `document`

```json
{
  "id": "confirmacao-nome",
  "title": "Confirmacao de nome",
  "startNodeId": "n-confirmar-nome"
}
```

- `id`: identificador estavel do fluxo. Nao altere ao editar um arquivo existente.
- `title`: nome legivel do fluxo.
- `startNodeId`: id do bloco inicial, quando conhecido.

### `nodes`

```json
{
  "id": "n-confirmar-nome",
  "title": "Confirma o nome",
  "description": "Primeira validacao conversacional.",
  "message": "Ola, preciso confirmar se falo com {{cliente_nome}}. E voce?"
}
```

- `id`: unico entre todos os blocos e ligacoes do fluxo.
- `title`: nome curto visivel no bloco.
- `description`: opcional; use para contexto curto, fonte, lacuna ou observacao.
- `message`: opcional; fala literal do agente. Preserve placeholders exatamente como vierem da fonte.

### `edges`

```json
{
  "id": "e-confirma-nome",
  "source": "n-confirmar-nome",
  "target": "n-apresentar-agente",
  "baseMessage": "Sim, sou eu.",
  "description": "Cliente confirma ser a pessoa procurada.",
  "examples": ["sim", "isso", "ele mesmo"]
}
```

- `id`: unico entre todos os blocos e ligacoes do fluxo.
- `source`: id do bloco de origem.
- `target`: id do bloco de destino.
- `baseMessage`: mensagem base/intencao do cliente; obrigatoria.
- `description`: opcional; regra, limite, condicao, fonte, inferencia ou lacuna.
- `examples`: opcional; array de strings com exemplos de falas do cliente.

## Layout opcional

O layout pode ser omitido se o agente nao souber posicionar os elementos. Quando presente:

- `layout.nodes[id]` exige `x`, `y`, `width`, `height`.
- `layout.edges[id]` pode ter `sourceSide`, `targetSide` e `labelOffset`.
- Nao use `waypoints`, IDs de portas ou outros campos de roteamento em `layout.edges[id]`.
- `sourceSide` e `targetSide` aceitam `top`, `right`, `bottom`, `left`.
- `labelOffset`, quando usado, exige `{ "x": number, "y": number }`.
- `layout.viewport`, quando usado, exige `x`, `y`, `zoom`; `zoom` deve ser positivo.
- So crie entradas de layout para ids existentes.

Recomendacao de layout inicial para leitura horizontal:

- Blocos de `240 x 120`.
- Grid visual de 60.
- Comece em `x = 60`, `y = 60`.
- disposição horizontal da árvore.
- Avance horizontalmente com passo aproximado de 420.
- Use passo vertical aproximado de 220 para ramos paralelos ou linhas novas.

Exemplo:

```json
"layout": {
  "nodes": {
    "n-confirmar-nome": { "x": 60, "y": 60, "width": 240, "height": 120 },
    "n-apresentar-agente": { "x": 480, "y": 60, "width": 240, "height": 120 }
  },
  "edges": {},
  "viewport": { "x": 0, "y": 0, "zoom": 1 }
}
```

## Regras de modelagem

1. Leia a fonte inteira antes de gerar o fluxo.
2. Represente somente o que e percebido na conversa: falas do agente, respostas do cliente, caminhos e encerramentos.
3. Nao crie blocos para API, script, busca de dados, validacao interna, normalizacao, roteamento tecnico ou classificadores.
4. Se uma operacao tecnica muda a conversa, represente apenas a mensagem ou o caminho comunicado ao cliente.
5. Nao invente ofertas, politicas, limites, mensagens ou desfechos. Se algo faltar, registre a lacuna em `description`.
6. Diferencie exemplos extraidos da fonte de exemplos criados pelo autor quando isso for relevante.
7. Permita ramificacoes, convergencias, ciclos, multiplas ligacoes entre os mesmos blocos e blocos desconectados em rascunho.
8. IDs nao dependem de titulos. Renomear `title` ou `baseMessage` nao altera `id`.
9. Ao excluir um bloco, remova tambem todas as ligacoes incidentes e seus layouts.
10. Ao editar arquivo existente, preserve `document.id`, ids dos elementos mantidos e layout valido.

## Antes de importar no editor

O importador faz `JSON.parse`, valida os campos sem descartar propriedades desconhecidas e confere referencias entre blocos, ligacoes e layout. Um unico erro bloqueia a abertura. A mensagem do editor mostra codigos e descricoes como `UNSUPPORTED_SCHEMA_VERSION`, `UNKNOWN_FIELD`, `INVALID_STRING`, `MISSING_TARGET_NODE` e `INVALID_EDGE_LAYOUT`. O validador tambem produz um caminho JSON Pointer para cada diagnostico, mas a janela de erro atual nao exibe esse caminho. Consulte `contracts/flow.schema.json` para conferir os campos aceitos.

Ao adaptar um JSON gerado para outro fluxo ou por outro agente:

1. Troque `schemaVersion` em texto pelo numero `1` somente se o restante do arquivo realmente seguir este contrato. Nao renomeie a versao de um formato diferente sem converter seus campos.
2. Remova `document.description` e `metadata` da raiz. Se a descricao for relevante para a conversa, coloque-a em `description` de um bloco apropriado; guarde proveniencia fora do `.flow.json`.
3. Em cada ligacao, use `baseMessage`. Converta `messageBase` ou `label` para `baseMessage` quando esses campos contiverem a fala ou intencao do cliente. Nao deixe o campo antigo junto.
4. Remova `waypoints` e outros dados de roteamento de `layout.edges`. O editor escolhe a rota quando nao ha configuracao compativel.
5. Confira IDs duplicados entre blocos e ligacoes, `source`, `target`, `startNodeId` e chaves de `layout.nodes`/`layout.edges`. Todos devem apontar para elementos existentes.
6. Confira tipos: textos sao strings; `examples` e array de strings; coordenadas e dimensoes sao numeros JSON finitos; `width`, `height` e `zoom` devem ser positivos. Omita campos opcionais desconhecidos em vez de usar `null`.

Para gerar um fluxo sem coordenadas, omita `layout` por completo. O importador cria posicoes para os blocos. Se incluir `layout.nodes[id]`, forneca `x`, `y`, `width` e `height` juntos; layout parcial significa omitir entradas de elementos, nao omitir campos dentro de uma entrada.

## Exemplo minimo

```json
{
  "schemaVersion": 1,
  "document": {
    "id": "confirmacao-nome",
    "title": "Confirmacao de nome",
    "startNodeId": "n-confirmar-nome"
  },
  "content": {
    "nodes": [
      {
        "id": "n-confirmar-nome",
        "title": "Confirma o nome",
        "message": "Ola, preciso confirmar se falo com {{cliente_nome}}. E voce?"
      },
      {
        "id": "n-apresentar-agente",
        "title": "Apresenta o agente",
        "message": "Obrigado. Sou {{agente_nome}}, da {{empresa}}."
      },
      {
        "id": "n-encerrar",
        "title": "Encerra a conversa",
        "message": "Obrigado pelo retorno. Encerramos por aqui."
      }
    ],
    "edges": [
      {
        "id": "e-confirma",
        "source": "n-confirmar-nome",
        "target": "n-apresentar-agente",
        "baseMessage": "Sim, sou eu.",
        "examples": ["sim", "isso", "ele mesmo"]
      },
      {
        "id": "e-pessoa-errada",
        "source": "n-confirmar-nome",
        "target": "n-encerrar",
        "baseMessage": "Nao sou eu.",
        "description": "Pessoa errada ou desconhece o cliente procurado.",
        "examples": ["nao sou eu", "nao tem ninguem com esse nome aqui"]
      }
    ]
  },
  "layout": {
    "nodes": {
      "n-confirmar-nome": { "x": 60, "y": 60, "width": 240, "height": 120 },
      "n-apresentar-agente": { "x": 480, "y": 60, "width": 240, "height": 120 },
      "n-encerrar": { "x": 480, "y": 280, "width": 240, "height": 120 }
    },
    "edges": {},
    "viewport": { "x": 0, "y": 0, "zoom": 1 }
  }
}
```

## Checklist antes de entregar

- O JSON e valido, completo e sem comentarios.
- Nao ha campos desconhecidos, `null`, `document.description`, `edge.label` ou `edge.key`.
- Todos os ids sao strings nao vazias e unicas entre nodes e edges.
- Toda ligacao aponta para `source` e `target` existentes.
- `document.startNodeId`, se existir, aponta para um node existente.
- Todo edge tem `baseMessage`.
- Todo `examples`, se existir, e array de strings.
- Todo layout, se existir, aponta apenas para ids existentes e usa numeros finitos.
- O fluxo representa conversa em alto nivel, sem etapas tecnicas internas.
- Lacunas, inferencias e limites estao documentados em `description`.
