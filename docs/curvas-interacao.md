# Superfície de interação — v0.5

## Dados e rastreabilidade

O arquivo `src/data/interaction-surface.json` foi gerado com
`ULSInteractionGenerator.fixed_n_curve` do código FlexoPy fornecido pelo usuário.
Não é uma superfície sintética nem um elipsoide ajustado. É o modelo de
`flexopy.demo.build_default_model(nx=48, ny=72)`:

- 300 × 600 mm, 8 Ø16, cobrimento 35 mm, estribos Ø6,3;
- concreto C30, γc = 1,40, aço CA-50, γs = 1,15, Es = 210.000 MPa;
- concreto tracionado desprezado, concreto deslocado pelas barras subtraído;
- N positivo em compressão, Mx = ΣF·y e My = ΣF·x;
- estados-limites do caminho original, com busca de todas as raízes e seleção
  do candidato de maior raio de momento por orientação.

São 54 níveis de força normal, entre 0 e aproximadamente 3.924,8 kN. Cada nível
não degenerado tem 120 orientações da **normal à linha neutra** (não confundir
esse ângulo com a direção do vetor momento). O último nível é o ponto de
compressão uniforme, em εc2 = 2‰. Há 6.362 vértices e 12.720 triângulos,
incluindo o centro da tampa em N = 0.

O JSON armazena hashes SHA-256 dos arquivos Python utilizados, resíduo axial
máximo da geração (inferior a 0,001 N), quatro estados de referência e os índices
dos anéis e triângulos. A componente N de cada vértice é colocada no nível alvo,
com arredondamento de sete casas; o resíduo original fica nos metadados.

O resíduo do equilíbrio **não** é a precisão total do diagrama. A discretização
das fibras, a amostragem angular/axial e a interpolação geométrica introduzem
aproximações. Valores mostrados com uma casa decimal são leituras didáticas da
malha, não resultados de uma nova busca de equilíbrio a cada movimento.

## Construção e cortes

Os pontos permanecem na ordem das orientações do gerador. Anéis adjacentes são
ligados por triângulos; o último anel é ligado ao topo. Não se aplica fecho
convexo 3D nem suavização que altere as coordenadas resistentes.

`src/core/interactionMesh.ts` intersecta cada triângulo com o plano prescrito.
Os segmentos são deduplicados e unidos por conectividade. Interseções tangentes
podem ser pontos; a função preserva componentes e não impõe uma curva polar.
Os próprios segmentos são usados no 3D e no SVG 2D. Logo, o corte mostrado nos
dois locais é o mesmo, inclusive entre níveis pré-gerados.

| Controle | Equação do plano | Eixos 2D |
| --- | --- | --- |
| Horizontal | N = constante | horizontal Mx; vertical My |
| Vertical magenta | My = constante | horizontal Mx; vertical N |
| Vertical amarelo | Mx = constante | horizontal My; vertical N |

Guias tracejadas indicam os demais planos nos 2D. O recorte visual opcional
remove o lado de coordenada maior que a do corte ativo, sem alterar dados ou
diagramas. A malha auxiliar é escondida durante esse recorte, evitando desenhar
fios na parte removida.

As coordenadas armazenadas são `[Mx, My, N]`, em kN·m, kN·m e kN. No Three.js,
elas são mapeadas para `[Mx·sM, N·sN, −My·sM]`. A transformação mantém os dois
momentos com a mesma escala e a orientação de um sistema destro. N usa escala
própria, por ser outra grandeza/unidade. Leituras são sempre convertidas de
volta às unidades físicas.

## Escopo e limitações

O gerador original rejeita N < 0, pois não implementa o ramo completo de
flexotração. Por isso, a base em N = 0 apenas fecha geometricamente o volume
**recortado ao escopo**. Não é uma superfície de ruptura de flexotração.
Essa base é tracejada nos diagramas verticais e identificada nas leituras.

Não há extrapolação, verificação de solicitação, dimensionamento de armadura,
efeitos de segunda ordem nem análise de estabilidade neste módulo. Os ajustes
do plano de deformações do módulo 01 são livres e independentes dos pontos de
ELU pré-gerados deste módulo. A seção e os materiais, porém, são os mesmos.

## Regenerar com o código original

Não é necessário Python para rodar o site. O JSON já está incluído no ZIP.
Para alterar o exemplo ou aumentar a resolução, use Python com NumPy e SciPy e
aponte para a pasta original que contém `src/flexopy`:

```bash
python scripts/generate-interaction.py --flexopy-root /caminho/para/pilares
npm run verify
npm run build
```

O script chama o algoritmo original; não precisa copiar nem modificar a pasta
do FlexoPy. Caso altere seção, materiais ou resolução, atualize também os rótulos
e os testes de referência do laboratório. Nunca substitua os dados sem indicar
a mudança de modelo. O código original continua sendo o arquivo `pilares.zip`
fornecido junto ao curso, não uma dependência do navegador.

## Validações incluídas

`npm run verify` verifica o estado mecânico do módulo 01, os sinais gráficos,
as escalas, quatro estados Python versus JavaScript, a capacidade de compressão,
a conectividade da malha fechada, 24 cortes representativos, planos externos,
coincidência com anéis pré-gerados e degeneração correta do topo.

O resultado não substitui estudo de convergência nem validação para uso em
projeto. Para as aulas, todas as operações de corte são locais e instantâneas,
sem servidor Python, banco de dados ou chamadas externas.
