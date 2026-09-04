# Mapeamento entre o FlexoPy e o laboratório visual

O laboratório reproduz no navegador o núcleo necessário ao primeiro visual. A
fonte de verdade consultada foi o pacote `pilares.zip` anexado ao projeto.

| Conceito | FlexoPy | Aplicação React |
| --- | --- | --- |
| Plano linear | `src/flexopy/strain.py` | `src/core/sectionModel.ts` (`strainAt`) |
| Concreto C30 | `src/flexopy/materials.py` | `concreteStress` |
| Aço CA-50 | `src/flexopy/materials.py` | `steelStress` |
| Integração em fibras | `src/flexopy/analysis.py` | `calculateSectionState` |
| Geometria 30 × 60 cm e 8 Ø16 | `src/flexopy/demo.py` | constantes `SECTION` e `REBARS` |
| Cena interativa | — | `src/visualizations/SectionScene.tsx` |
| Altura gráfica | — | `src/core/visualEncoding.ts` |

## Convenções preservadas

- `ε(x,y) = ε0 + gx·x + gy·y`;
- coordenadas em milímetros no cálculo;
- compressão e tensão de compressão positivas;
- `Mx = Σ(Fi·yi)` e `My = Σ(Fi·xi)`;
- concreto tracionado com `σc = 0`;
- desconto do concreto deslocado pelas barras;
- tensão do aço limitada a `±fyd`.

Na interface, `ε0` aparece em ‰ e os gradientes em ‰/m. A conversão para as
unidades internas do FlexoPy é feita antes de qualquer integração.

## Por que o plano e as tensões estão no mesmo visual

O plano é a entrada cinemática. As cores das fibras e barras são a resposta dos
materiais ao mesmo valor de deformação em cada coordenada. Mantê-los na mesma
cena permite acompanhar a cadeia `ε → σ → F → (N, Mx, My)` sem sincronizar duas
câmeras ou dois conjuntos de controles.

O seletor **Tensão σ / Deformação ε** troca apenas a grandeza codificada nas
cores. Geometria, plano, linha neutra e resultados permanecem sincronizados.

## Altura gráfica e convenção de sinais

O eixo vertical da cena não representa deslocamento nem uma dimensão geométrica
da seção. A altura é calculada apenas para visualização por
`h_visual = -420·ε`. Assim, mantendo a convenção do FlexoPy, `ε > 0` continua
sendo compressão, mas é desenhada abaixo da seção; `ε < 0` é tração e aparece
acima. Isso evita que uma fibra comprimida pareça estar se alongando para fora
da seção.

O mapa discretizado, o plano e os centros das barras usam exatamente essa mesma
transformação. As células do mapa recebem a inclinação do plano. As barras,
porém, mantêm o eixo vertical: sua orientação não muda, somente a altura do
centro em cada coordenada. A seção em `ε = 0` é a referência fixa.

Na v4, a opacidade do preenchimento é ajustável de 0 a 100%, e o seletor de cor
controla preenchimento, contorno e malha da seção fixa. A opacidade do contorno e
da malha é mantida para orientação, inclusive quando o preenchimento está
transparente. O padrão usa 10% de opacidade. Esses ajustes são exclusivamente
visuais e não alteram a deformação prescrita, as tensões ou as resultantes.

No modo de tensões, a altura continua codificando `ε`, enquanto a cor codifica
`σ`. No modo de deformações, altura e cor codificam `ε`. Tensões, forças e
momentos são calculados com as deformações reais, sem ampliação nem inversão.

## Escalas cromáticas

- concreto: azul-escuro, azul, ciano, verde, amarelo, laranja e vermelho, de
  `σc = 0` até `σc,max = 0,85·ηc·fcd`;
- aço e deformação: escala divergente, do violeta/azul em tração, passando pelo
  branco em zero, até amarelo/laranja/vermelho em compressão.

As cores são aplicadas sem iluminação tonal para permanecerem nítidas e iguais
às respectivas legendas.
