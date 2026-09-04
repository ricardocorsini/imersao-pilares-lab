# Laboratório Visual — Pilares em Python

Aplicação React + Vite para reunir, em uma única página, as visualizações
interativas do curso de flexocompressão oblíqua.

## Versão 0.6 — forças nas fibras e armaduras

O menu **Gráficos** reúne três módulos, preservando os dois anteriores.
O novo **03 · Forças nas fibras** mostra a seção fixa com malha e oito barras,
além das setas verticais de força em cada elemento:

- **Esforços:** regule N, Mx e My; o navegador procura o equilíbrio da seção.
- **Deformações:** regule ε₀, gₓ e gᵧ e observe as resultantes, sem mover a seção.
- **12 malhas:** de 4 × 8 a 24 × 48, com 32 a 1.152 fibras.
- **60 estados pré-calculados:** cinco exemplos em cada uma das 12 malhas.
- Setas com comprimento proporcional à força, na mesma escala para concreto e
  aço. Compressão para baixo e tração para cima.
- Seleção por clique/toque ou menu, com força, tensão, área e parcelas de momento.
- Quadro de equilíbrio, cores vivas, controles de camadas, cor e transparência.

**Não é necessário pré-processar para usar o aplicativo.** Os exemplos já estão
no pacote; os demais carregamentos são calculados em JavaScript no navegador,
sem Python, servidor de cálculo ou interpolação entre exemplos. Para regenerar
os exemplos depois de alterar o modelo, use `npm run generate:forces`.

A seta da barra representa a contribuição **líquida** `(σs − σc)·As`, mantendo a
integração de concreto na área bruta do algoritmo original. A força real do aço
e o desconto do concreto deslocado aparecem na leitura do elemento. Os resíduos
são exibidos mesmo quando o cálculo não converge. Este modelo é didático, não uma
verificação de ELU ou de estabilidade. Veja [o modelo do módulo 03](docs/forcas-fibras.md).

## Módulo 02 — superfície de interação

O módulo **02 · Curvas de interação** mostra a superfície `N–Mx–My` e três cortes simultâneos:

| Cor | Plano de corte | Diagrama 2D |
| --- | --- | --- |
| Ciano | N constante (horizontal) | Mx × My |
| Magenta | My constante (vertical) | Mx × N |
| Amarelo | Mx constante (vertical) | My × N |

- Gire com o mouse/toque e aproxime com a roda/pinça.
- Escolha o corte ativo no painel ou nos botões sobre a cena; arraste sua seta
  no 3D, use o slider ou digite o valor. Os três diagramas acompanham os cortes.
- Passe sobre a superfície ou uma curva para ler N, Mx e My. Clique/toque para
  fixar o ponto; **×** libera a leitura. Nos gráficos 2D, Tab e as setas do teclado
  permitem percorrer os pontos. O marcador branco aparece no 3D e nos 2D em que
  o ponto pertence ao plano, sem projetar falsamente pontos de outros cortes.
- Regule a opacidade, exiba/oculte planos e malha ou esconda o lado positivo do
  corte ativo. Esse último recurso recorta a superfície visualmente; os diagramas
  continuam mostrando os cortes completos.
- As escalas 2D ficam fixas inicialmente, para perceber a variação da capacidade.
  **Ajustar escala dos 2D** enquadra cada curva automaticamente.

A superfície é pré-calculada pelo **mesmo FlexoPy anexado**, com a seção padrão,
54 níveis de N e 120 orientações por curva não degenerada. Os cortes e as leituras
são interpolados na mesma malha triangular do 3D. A geração é de resistência
seccional didática, não uma verificação de estabilidade do pilar.

**Escopo:** N ≥ 0, compressão positiva. A base N = 0 é somente o limite do escopo
do gerador; sua linha tracejada nos cortes verticais não é ruptura à tração.
Não foram inventados estados resistentes em N < 0. Veja os detalhes de
[rastreabilidade e regeneração](docs/curvas-interacao.md).

## Módulo 01 — ajustes da v4 preservados

O primeiro módulo combina em uma cena 3D:

- seção retangular discretizada em 48 × 72 fibras;
- oito barras Ø16;
- plano `ε(x,y) = ε0 + gx·x + gy·y`;
- linha neutra `ε = 0`;
- mapa de deformações ou tensões;
- integração instantânea de `N`, `Mx` e `My`.

Desde a versão 0.4, o painel lateral permite regular a opacidade do preenchimento da
seção fixa (0–100%) e escolher sua cor. O botão **Padrão** restaura somente esses
ajustes: 10% de opacidade e ciano. Contorno e malha permanecem como referência.

O mapa discretizado continua acompanhando o plano. As barras permanecem
verticais, mudando apenas de altura nas respectivas coordenadas, sem inclinar.
As escalas cromáticas da v3 foram preservadas.

O menu **Gráficos**, no cabeçalho, seleciona o módulo exibido. Apenas o gráfico
selecionado é montado, evitando manter várias cenas 3D ativas ao mesmo tempo.

A convenção numérica continua sendo compressão positiva; apenas a altura gráfica
é invertida, mostrando tração acima e compressão abaixo da seção.

## Executar localmente

Use Node.js 24 ou superior.

```bash
npm install
npm run dev
```

Abra o endereço informado pelo Vite no terminal.

## Conferir e gerar a versão de produção

```bash
npm run verify
npm run build
npm run preview
```

O conteúdo estático final fica em `dist/` e pode ser publicado na Vercel.

O ZIP já inclui `dist/`. Para abrir essa versão pronta sem instalar dependências
ou recompilar, execute `node scripts/serve-dist.mjs` na pasta extraída e acesse
`http://localhost:4173`. O servidor é apenas local e não executa os cálculos.
Não abra `dist/index.html` com duplo clique: os módulos JavaScript precisam de HTTP.

Na Vercel: framework **Vite**, comando de build `npm run build`, saída `dist`.

## Estrutura

```text
src/
  components/          controles e métricas reutilizáveis
  core/                cálculo mecânico e escalas de cores
  data/                superfície e exemplos de forças pré-calculados
  visualizations/      módulos didáticos e cena Three.js
  App.tsx               composição da página única
  styles.css            sistema visual responsivo
docs/
  mapeamento-flexopy.md rastreabilidade com o código Python
  curvas-interacao.md   geração dos dados, cortes e limitações
  forcas-fibras.md      forças locais, malhas, equilíbrio e pré-cálculo
scripts/
  verify-reference.ts  regressão do exemplo 01 do FlexoPy
  verify-interaction.ts regressão dos dados e da malha de cortes
  generate-interaction.py  regeneração opcional com o FlexoPy original
  generate-forces.ts    5 exemplos × 12 malhas, em JavaScript
  verify-forces.ts      forças, equilíbrio, cache e proporcionalidade
  serve-dist.mjs        abrir a versão pronta sem instalar dependências
```

## Adicionar o próximo gráfico

1. Crie o componente em `src/visualizations/`.
2. Registre `id`, `number`, `menuLabel`, `chapter`, `title`, `model` e `Component` em
   `src/visualizations/registry.tsx`.
3. Reaproveite os tokens e padrões de `styles.css` para manter a identidade
   visual.

Não é necessário alterar o menu nem criar outra rota: o seletor é preenchido
automaticamente pelo registro, na ordem dos módulos. Use um `id` único e estável
para cada gráfico. A URL com `#id-do-grafico` abre diretamente o módulo, inclusive
após recarregar a página; os botões Voltar/Avançar acompanham a seleção.

Os gráficos usam `#plano-de-deformacoes`, `#curvas-de-interacao` e `#forcas-nas-fibras`. Esses fragmentos
podem ser usados nos links da apostila. Novos módulos só aparecem no menu depois de implementados e
registrados. Ao trocar de módulo, o estado local do gráfico anterior é desmontado.

## Fonte numérica

Veja [`docs/mapeamento-flexopy.md`](docs/mapeamento-flexopy.md). O comando
`npm run verify` compara o estado inicial com os valores produzidos por
`examples/01_estado_secao.py` do código anexado.
