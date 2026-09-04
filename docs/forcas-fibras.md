# Módulo 03 — forças nas fibras e armaduras

## Uso na aula

Selecione **03 · Forças nas fibras** no menu, ou use o fragmento
`#forcas-nas-fibras` no link da apostila. A seção permanece fixa, assim como as
coordenadas e a orientação das barras. As setas são forças, não deslocamentos.

1. Comece por **Compressão**: todas as forças apontam para baixo.
2. Passe a **Flexão** ou **Oblíqua**: surgem diferenças entre as forças locais,
   e barras podem estar tracionadas enquanto o concreto do outro lado comprime.
3. Em **Tração**, o concreto não participa; as barras recebem setas para cima.
4. Em **Zero**, não há setas residuais com tamanho mínimo artificial.
5. Refine a malha: a força por fibra diminui porque sua área diminui. O total não
   deve ser confundido com o tamanho de uma seta isolada.

O mouse/toque gira a cena; roda ou pinça controla o zoom. Clique/toque em uma
fibra ou barra para fixar sua leitura. O seletor **Elemento** oferece a mesma
leitura por teclado. **×** libera a seleção. Opções de vista e **Reenquadrar**
facilitam a apresentação. Na vista em planta as setas são vistas de frente:
use suas cores e os valores, não a projeção do comprimento, para comparar forças.

Em **Visualização e seção fixa** é possível ocultar as setas de cada material,
mostrar o mapa de forças, regular a opacidade do preenchimento e escolher sua cor.
Contorno e linhas da malha permanecem como referência mesmo com preenchimento
transparente. Ocultar setas não remove nenhuma contribuição do equilíbrio.

## Malhas e pré-processamento

São 12 opções, com células quadradas na seção de 300 × 600 mm:

| Divisões x × y | Fibras | Lado da fibra (mm) |
| --- | ---: | ---: |
| 4 × 8 | 32 | 75,00 |
| 5 × 10 | 50 | 60,00 |
| 6 × 12 | 72 | 50,00 |
| 8 × 16 | 128 | 37,50 |
| 10 × 20 | 200 | 30,00 |
| 12 × 24 | 288 | 25,00 |
| 14 × 28 | 392 | 21,43 |
| 16 × 32 | 512 | 18,75 |
| 18 × 36 | 648 | 16,67 |
| 20 × 40 | 800 | 15,00 |
| 22 × 44 | 968 | 13,64 |
| 24 × 48 | 1.152 | 12,50 |

As oito barras não são remalhadas: posição e área são as mesmas em todas as opções.
Esta versão usa células uniformes em cada malha, mas o método das fibras em si
não exige áreas iguais. As forças individuais sempre usam a área do elemento.

Os cinco botões de exemplo foram resolvidos em todas as malhas: **60 estados
completos**, incluindo deformações e tensões por fibra/barra. O arquivo
`src/data/fiber-force-examples.json` já está incluído. O aplicativo busca uma
correspondência exata entre malha e N/Mx/My; nunca usa um exemplo aproximado.

Para valores intermediários dos sliders, resolve o equilíbrio em JavaScript.
Assim, não é preciso pré-calcular todas as combinações possíveis dos controles.
No modo **Deformações**, a integração é direta e também ocorre no navegador.

Regeneração opcional, com Node.js 24 ou superior:

```bash
npm run generate:forces
npm run verify
npm run build
```

O gerador usa o mesmo motor numérico importado pelo aplicativo. Os testes conferem
o hash dos arquivos do motor/catálogo, os 60 estados e a validade dos somatórios.
Ao alterar seção, materiais ou leis constitutivas, regenere os dados antes de
compilar. O gráfico 01 continua usando sua malha original de 48 × 72.

## Forças, unidades e sinais

O motor de `src/core/sectionModel.ts` reproduz a integração do FlexoPy anexado,
conforme `mapeamento-flexopy.md`: concreto sem resistência à tração,
parábola-retângulo em compressão e aço elastoplástico simétrico.

Com tensões em MPa e áreas em mm², a força em kN é:

```text
Fc,i = σc,i · Ac,i / 1000
Fs,j = σs,j · As,j / 1000
ΔFs,j = (σs,j − σc,j) · As,j / 1000
```

O concreto é integrado na **área bruta** da seção. Por isso, somar simplesmente
`Fc + Fs` duplicaria o concreto nos lugares ocupados pelo aço. A seta da barra
mostra `ΔFs`, a contribuição líquida que o código original soma. O inspetor
expõe a tensão real `σs`, a força real `Fs` e o desconto `σc·As` separadamente.

As resultantes seguem a convenção algébrica do código fornecido, com x e y em mm:

```text
N  = ΣFc + ΣΔFs                       [kN]
Mx = (ΣFc·y + ΣΔFs·y) / 1000         [kN·m]
My = (ΣFc·x + ΣΔFs·x) / 1000         [kN·m]
```

Compressão é positiva. A cena representa as forças na face superior isolada:
compressão aponta para baixo; tração, para cima. No mundo 3D a coordenada vertical
serve exclusivamente para desenhar as setas. O eixo y da seção é horizontal.

## Escala visual

`comprimento = |força em kN| × 0,035 × ganho`, em unidades da cena. A mesma
constante é usada para concreto e aço. Não há normalização pelo maior valor
do estado atual, corte de comprimentos ou tamanho mínimo para forças nulas.
Uma seta branca de **25 kN** serve de referência na cena.

O ganho visual altera todas as setas igualmente; não modifica as forças nem
o equilíbrio. A câmera não se reenquadra ao alterar esforços ou malha.

A escala cromática é fixa, de −120 a +120 kN, comum aos dois materiais. Tração
usa ciano/azul/violeta; compressão, amarelo/laranja/vermelho/magenta. Valores além
dos extremos saturam apenas a cor, não o comprimento. O inspetor continua
mostrando os valores reais. A escala é de **força**, não de tensão: células
menores podem ter a mesma tensão e forças diferentes por terem áreas diferentes.

## Busca de equilíbrio e limites

No modo **Esforços**, um Newton amortecido ajusta ε₀, gₓ e gᵧ até reproduzir
N/Mx/My. Usa três incógnitas normalizadas, diferenças finitas, busca de passo e
reinicializações limitadas. O estado anterior fornece um ponto inicial quando
possível. O resíduo é sempre `interno − solicitado`.

O critério é a norma euclidiana do vetor de resíduos normalizado por
`[4000 kN, 500 kN·m, 250 kN·m]`, inferior a `10⁻⁶`. Isso limita os resíduos
absolutos, individualmente, a 0,004 kN, 0,0005 kN·m e 0,00025 kN·m.

Se não houver convergência, a página avisa e mostra a melhor tentativa e os
resíduos reais. Não a apresenta como equilíbrio. Uma falha numérica, isoladamente,
não demonstra insuficiência da seção; tampouco uma convergência verifica ELU,
estabilidade, domínio normativo, unicidade ou segurança de uma estrutura real.

No modo **Deformações**, não há esforços-alvo: as resultantes são calculadas a
partir do plano prescrito. O plano é apenas uma variável do cálculo, nunca uma
superfície móvel neste módulo. As referências de +3,5‰ no concreto e −10‰ no aço
geram avisos, mas não substituem a verificação dos domínios de deformação.

As leis materiais são não lineares. Dobrar N ou M não necessariamente dobra a
força de cada fibra. O que é rigorosamente proporcional é o comprimento da seta
à força **local**. Ao refinar a malha com esforços prescritos, o plano é resolvido
novamente; com deformações prescritas, as resultantes podem variar um pouco pela
quadratura. Ambos os comportamentos são intencionais.
