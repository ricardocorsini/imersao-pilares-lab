# Comparação na tela 02 — processo aproximado da NBR 6118

Implementação adicionada sobre a base `lab_v15.zip`, sem substituir o arquivo
`src/data/interaction-surface.json` ou mudar os demais laboratórios.

## Referência e escopo

A expressão e os dois valores de expoente foram retirados do trecho do item
17.2.5 da NBR 6118:2026 fornecido pelo usuário. O módulo compara a fronteira
aproximada com o **modelo numérico por fibras**, não com uma resistência física
exata nem com uma verificação completa de pilar.

Para cada força normal fixa N_Rd = N_Sd:

    (|Mx| / M_Rd,xx)^α + (|My| / M_Rd,yy)^α = 1

- α = 1,2 é a opção inicial para a seção retangular existente.
- α = 1 é a alternativa geral do trecho fornecido.
- Não há calibração automática de α.
- Os denominadores são módulos; os sinais de Mx/My definem o quadrante.
- Nesta seção, x/y passam pelo centroide e são eixos principais de inércia da
  seção bruta. A expressão não é aplicada a um sistema O' transladado.

## De onde vêm os denominadores

M_Rd,xx é obtido na interseção da curva por fibras com My = 0; M_Rd,yy,
na interseção com Mx = 0. Não se utiliza o maior Mx ou My de um estado oblíquo
como substituto da flexão composta normal. Os quatro sentidos (+x, −x, +y, −y)
são extraídos separadamente. Na seção atual, a simetria faz os módulos de
sentidos opostos coincidirem.

Todos os valores usam o mesmo N, materiais, armadura, referência e convenções
de sinais do JSON existente. Entre níveis pré-gerados, os interceptos do corte
triangular corrente são interpolados, exatamente como o restante da tela.
Não se faz uma nova busca de equilíbrio nem uma nova integração de fibras.

## Visualização e sincronização

Os modos são `Modelo por fibras` (comportamento inicial preservado),
`Sobrepor os dois` e `Só aproximado`. A aproximação usa superfície laranja e
curvas tracejadas; o modelo por fibras mantém suas cores originais. Leitura
por mouse, toque, teclado e fixação de ponto informa a origem do valor.

A superfície aproximada é a aplicação da expressão em todos os níveis de N.
O nível N corrente é inserido como um anel adicional, usando seus próprios
interceptos. Os mesmos triângulos gerados são cortados no 3D e nos três 2D.
Logo, os cortes horizontais e verticais são consistentes com o objeto exibido.

O comparador radial avalia a expressão analítica em uma direção φ do momento:

    R_aprox(φ) = [(|cos φ| / M_Rd,xx)^α + (|sen φ| / M_Rd,yy)^α]^(-1/α)
    ΔR (%) = 100 · (R_aprox / R_fibras − 1)

R_fibras é a interseção do mesmo raio com o corte por fibras. φ não é θ,
o ângulo da normal à linha neutra. A malha desenhada liga amostras por
segmentos; entre amostras, pode haver pequena diferença gráfica em relação
ao ponto analítico do comparador.

ΔR positivo significa maior capacidade aproximada na direção escolhida;
negativo, menor. Não é um erro experimental nem uma garantia global de
conservadorismo. Sobre os eixos, os dois modelos coincidem por construção.
Nos cortes verticais com o outro momento igual a zero, a coincidência também
é esperada: ambos compartilham os mesmos interceptos em todos os N.

## Limites e validação

Em N = N_comp, a fronteira reduz-se a (0,0); não se avalia a expressão com
denominadores nulos e o comparador radial é suspenso. N < 0 permanece fora do
escopo, e a tampa em N = 0 não representa ruptura à tração.

Os testes conferem extração dos interceptos (inclusive um exemplo cujo máximo
oblíquo não é intercepto), quatro quadrantes, expoentes, sinais, fechamento da
malha, degeneração do topo, níveis intermediários e continuidade dos cortes.

    npm run verify:nbr
    npm run verify
    npm run build

O ZIP v15 não continha `vite.config.ts`, embora `tsconfig.node.json` já o
referenciasse. Foi incluída a configuração mínima com o plugin React para
restabelecer o comando de build previsto pelo projeto, sem novas dependências.
