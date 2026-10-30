# Módulos 13 e 14 — geometria e discretização de polígonos

Os dois módulos estendem as visualizações do curso com o modelo geométrico da
**Aula 03 — Geometria, armaduras e método das fibras**, seções 3.8 e 3.10–3.13.
O cálculo é local, no navegador, sem serviços externos ou novas dependências.

## 13 · Geração da malha

- Presets: trapézio da apostila, retângulo, L, T, triângulo e polígono irregular.
- Coordenadas em **mm**, um par por linha. O editor aceita `x; y`, `x y` e
  `x, y`. Para decimais com vírgula, use ponto e vírgula ou espaço entre os
  números: `120,5; 600`. O último vértice se liga ao primeiro; um fechamento
  repetido é removido.
- Contorno simples e maciço, convexo ou côncavo, com 3 a 80 vértices em ordem.
  Ambos os sentidos de percurso são válidos. Cruzamentos, contatos entre
  arestas não adjacentes, sobreposições, repetições internas, área degenerada e
  números inválidos são rejeitados antes de substituir a geometria exibida.
  Vazios e regiões desconectadas ficam fora deste modelo.
- O retângulo envolvente é dividido uniformemente em `nx × ny`, com 1 a 120
  divisões por direção: no máximo **14.400 células candidatas**.
- Também é possível definir um tamanho-alvo `h`: `nx = ceil(largura/h)` e
  `ny = ceil(altura/h)`. As dimensões efetivas `Δx` e `Δy` são ajustadas ao
  envolvente e exibidas, sem resto ou células de tamanho diferente.
- O centro de cada célula é classificado por paridade de cruzamentos de um
  raio, com um teste explícito de pertencimento ao segmento para incluir a
  borda. **Centro dentro ou sobre o contorno: entra a célula inteira.** Centro
  fora: a célula inteira é descartada. Não há recorte geométrico das fibras.
- Animação de baixo para cima, linha a linha, com pausa, retomada, passo único,
  velocidade, cursor e resultado completo. Alterar a geometria ou resolução
  encerra a varredura anterior e exibe a nova malha completa.
- Clique ou setas do teclado selecionam uma célula. A inspeção mostra índice,
  centro, área, classificação e área incorporada. Uma célula ainda não testada
  permanece identificada como pendente na varredura.
- Camadas de grade, células rejeitadas, centros, vértices e centroides;
  preenchimento e cor das células aceitas ajustáveis.

## Propriedades exatas e aproximadas

A área e o centroide exatos vêm das somas orientadas do contorno (shoelace).
O sinal da área orientada é preservado no denominador do centroide. As somas
são feitas após uma translação interna para reduzir cancelamentos numéricos,
e o resultado retorna às coordenadas fornecidas.

Para a malha, `Am = Σ Ai` e `Cm = Σ Ai·(xi, yi) / Am`. A referência não é
recentrada no centroide aproximado. São mostrados:

- `ΔA = Am − Ac`, com sinal, em mm²;
- `eA = |Am − Ac| / Ac`, em %;
- `Δx = xCm − xC` e `Δy = yCm − yC`, em mm;
- `‖Cm − C‖`, em mm;
- `eC = ‖Cm − C‖ / Lref`, em %, onde `Lref` é a maior dimensão do envolvente.

Se nenhum centro for aceito, `Am = 0` e o centroide é **indefinido**. O painel
mostra essa condição e os gráficos não inventam um valor de centroide zero.
As comparações de propriedades se referem explicitamente à **malha completa**;
a contagem do reprodutor se refere às células testadas até o passo atual.

## 14 · Erros e refinamento

O estudo mantém contorno, coordenadas e origem e varia apenas a grade. São
amostrados até 13 níveis de resolução, com proporções compatíveis com o
envolvente. O gráfico mostra eA e eC em uma escala vertical comum, e a
quantidade de células candidatas em escala horizontal logarítmica. A malha
atual é incluída mesmo que tenha proporção diferente dos níveis automáticos.

Clique nos pontos, use as setas com o gráfico focado ou escolha uma linha da
tabela para adotar a resolução. As células aceitas e os erros são recalculados.
Uma segunda vista sobrepõe o contorno exato à malha, destacando **área em falta**
e **área em excesso**, com C e Cm na escala real da seção.

O erro pelo teste do centro pode oscilar com a resolução e com o alinhamento
dos centros à borda. A linha entre as amostras serve apenas à leitura, sem
prometer convergência monótona. Erro nulo de área não prova centroide exato e
propriedades geométricas exatas não garantem integração exata de tensões
variáveis.

Os dois módulos compartilham contorno e resolução durante a sessão da aba.
O modo aula usa a estrutura existente, sem clonar controles: gráfico ampliado,
painéis e cards móveis, ferramentas de desenho e histórico independente por
gráfico. No módulo 14 é possível ampliar o gráfico de erros ou a comparação
de borda e centroides.

## Exemplo de referência e verificação

Para `(0,0), (300,0), (180,600), (0,600)` mm:

| Propriedade | Contorno exato | Malha 5 × 10 (60 mm) |
| --- | ---: | ---: |
| Área (mm²) | 144.000 | 147.600 |
| xC (mm) | 122,5 | 126,58536585 |
| yC (mm) | 275 | 272,92682927 |
| Células aceitas | — | 41 de 50 |
| Erro de área | — | 2,5% |
| Distância entre centroides | — | 4,58129360 mm |
| Erro relativo do centroide | — | 0,76354893% |

`npm run verify:polygon-mesh` confere esses valores por somas independentes,
retângulos com várias resoluções, L por composição de áreas, centro na borda,
orientação reversa, translação das coordenadas, malha vazia, refinamento e
validação do editor. `npm run verify` inclui essa verificação na suíte geral.
