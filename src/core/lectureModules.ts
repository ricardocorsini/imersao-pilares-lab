/** Seletores dos blocos reais do módulo. O modo aula não clona nem remonta controles. */
export type LectureBlock = { id: string; label: string; selector: string; width?: number; tone?: "light" | "dark" };
export type LectureGraph = LectureBlock & { kind: "canvas" | "svg" };
export type LectureModule = { graphs: LectureGraph[]; controls: LectureBlock[]; cards: LectureBlock[] };
const block = (id: string, label: string, selector: string, width = 420, tone: "light" | "dark" = "light"): LectureBlock => ({ id, label, selector, width, tone });
const graph = (id: string, label: string, selector: string, kind: "canvas" | "svg" = "svg"): LectureGraph => ({ id, label, selector, kind });

export const LECTURE_MODULES: Record<string, LectureModule> = {
  "plano-de-deformacoes": {
    graphs: [graph("section", "Seção 3D", ".scene-wrap", "canvas")],
    controls: [block("parameters", "Plano, camadas e aparência", ".controls-panel"), block("camera", "Grandeza e câmera", ".viewport-toolbar", 420, "dark")],
    cards: [block("results", "Resultantes N, Mx e My", ".result-strip", 560), block("equation", "Equação do plano", ".equation"), block("status", "Estado atual", ".live-status"), block("camera", "Grandeza e câmera", ".viewport-toolbar", 460, "dark")],
  },
  "curvas-de-interacao": {
    graphs: [graph("surface", "Superfície 3D", ".interaction-scene", "canvas"), graph("mxmy", "Corte Mx × My", ".slice-chart:nth-child(1) .slice-svg-wrap"), graph("mxn", "Corte Mx × N", ".slice-chart:nth-child(2) .slice-svg-wrap"), graph("myn", "Corte My × N", ".slice-chart:nth-child(3) .slice-svg-wrap")],
    controls: [block("cuts", "Cortes e aparência", ".interaction-controls"), block("nbr", "Comparação NBR 6118", ".nbr-comparison-panel"), block("camera", "Vista e câmera", ".interaction-toolbar", 420, "dark")],
    cards: [block("reading", "Leitura do ponto", ".point-inspector", 480, "dark"), block("mxmy", "Corte Mx × My", ".slice-chart:nth-child(1)", 460, "dark"), block("mxn", "Corte Mx × N", ".slice-chart:nth-child(2)", 460, "dark"), block("myn", "Corte My × N", ".slice-chart:nth-child(3)", 460, "dark"), block("formula", "Expressão aproximada", ".nbr-expression-block"), block("intercepts", "Resistências uniaxiais", ".nbr-intercepts"), block("comparison", "Comparação radial", ".nbr-radial-comparison", 580), block("axial-control", "Controle do corte N", ".cut-control:has(#cut-number-n)"), block("camera", "Vista e câmera", ".interaction-toolbar", 460, "dark")],
  },
  "forcas-nas-fibras": {
    graphs: [graph("section", "Forças na seção 3D", ".force-scene", "canvas")],
    controls: [block("parameters", "Esforços, deformações e malha", ".force-controls"), block("camera", "Vista e câmera", ".force-toolbar", 420, "dark")],
    cards: [block("reading", "Leitura da fibra ou barra", ".force-inspector", 510, "dark"), block("balance", "Equilíbrio e resultantes", ".force-balance", 620)],
  },
  materiais: {
    graphs: [graph("concrete", "Diagrama do concreto", ".material-concrete-panel .material-chart-wrap"), graph("steel", "Diagrama do aço", ".material-steel-panel .material-chart-wrap")],
    controls: [block("parameters", "Materiais e deformações", ".materials-controls")],
    cards: [block("concrete", "Leitura do concreto", ".material-concrete-panel .material-readout", 450, "dark"), block("steel", "Leitura do aço", ".material-steel-panel .material-readout", 450, "dark"), block("constants", "Parâmetros dos materiais", ".material-parameters", 650), block("cursors", "Controles das deformações", ".material-cursor-controls")],
  },
  "distribuicoes-projetadas": {
    graphs: [graph("strain", "Deformação ε(z)", ".depth-chart-card:nth-child(1) .depth-chart-svg-wrap"), graph("stress", "Tensão σ(z)", ".depth-chart-card:nth-child(2) .depth-chart-svg-wrap"), graph("forces", "Contribuições de força", ".depth-chart-card:nth-child(3) .depth-chart-svg-wrap")],
    controls: [block("parameters", "Perfil projetado e barras", ".distribution-controls")],
    cards: [block("bar", "Leitura da barra", ".selected-bar-panel", 580, "dark"), block("results", "Resultantes da seção", ".distribution-resultants", 580), block("strain", "Diagrama ε(z)", ".depth-chart-card:nth-child(1)", 540, "dark"), block("stress", "Diagrama σ(z)", ".depth-chart-card:nth-child(2)", 540, "dark")],
  },
  "geometria-projetada": {
    graphs: [graph("section", "Seção e linha neutra", ".geometry-diagram-panel:not(.is-projection) .geometry-svg-wrap"), graph("projection", "Eixos projetados p e z", ".is-projection .geometry-svg-wrap")],
    controls: [block("parameters", "Geometria, θ e linha neutra", ".geometry-controls")],
    cards: [block("metrics", "h, d e linha neutra", ".geometry-metrics"), block("bar", "Barra selecionada", ".geometry-selected-bar", 560, "dark"), block("formula", "Equações da projeção", ".geometry-equation-strip", 580, "dark"), block("depths", "Profundidades das barras", ".geometry-bar-depths", 620), block("sliders", "Controles de θ e linha neutra", ".geometry-range-stack")],
  },
  "navegador-estados-limites": {
    graphs: [graph("strain", "Diagrama ε(z)", ".limit-visual-panel:nth-child(2) .limit-svg-wrap"), graph("section", "Seção e deformações", ".limit-visual-panel:nth-child(1) .limit-svg-wrap")],
    controls: [block("parameters", "Parâmetros do estado-limite", ".limit-state-controls"), block("navigator", "Percurso t e animação", ".limit-domain-navigator", 600)],
    cards: [block("metrics", "Deformações e linha neutra", ".limit-state-metrics"), block("formula", "Fronteira x23", ".limit-x23-formula"), block("steel", "Comparação no aço", ".limit-steel-comparison"), block("classification", "Classificação do domínio", ".limit-classification-panel", 620), block("navigator", "Controle de t e animação", ".limit-domain-navigator", 680)],
  },
  "equilibrio-busca-raizes": {
    graphs: [graph("roots", "Curva de equilíbrio e raízes", ".root-chart-wrap")],
    controls: [block("parameters", "Busca, método e animação", ".root-search-controls"), block("chart", "NRd ou resíduo f(t)", ".root-chart-mode", 420, "dark")],
    cards: [block("roots", "Raízes e resíduos", ".root-results-panel", 650), block("step", "Iteração atual", ".root-current-step"), block("brent", "Intervalo entregue ao Brent", ".root-brent-box")],
  },
  "construcao-curva-interacao": {
    graphs: [graph("curve", "Construção da curva Mx–My", ".curve-build-chart-wrap"), graph("section", "Estado resistente na seção", ".curve-section-wrap")],
    controls: [block("parameters", "Construção e animação", ".curve-construction-controls")],
    cards: [block("point", "Auditoria do ponto", ".curve-point-inspector", 540), block("summary", "Resumo das raízes", ".curve-search-summary"), block("formula", "Mecânica e geometria", ".curve-mechanics-note", 650), block("player", "Controle da construção", ".curve-player", 420, "dark")],
  },
  "dominios-deformacao-nbr": {
    graphs: [graph("domains", "Diagrama dos domínios", ".domain-map-wrap")],
    controls: [block("navigator", "Domínios, concreto e animação", ".domain-navigator", 600)],
    cards: [block("lesson", "Domínio atual e leituras", ".domain-lesson-panel", 510), block("constants", "Limites de deformação", ".domain-constants", 580), block("table", "Resumo dos domínios", ".domain-summary-table", 700), block("navigator", "Controle dos domínios e animação", ".domain-navigator", 720)],
  },
  "verificacao-radial": {
    graphs: [graph("radial", "Verificação no plano Mx–My", ".radial-chart")],
    controls: [block("demand", "Momentos solicitantes", ".radial-coordinate-controls", 420, "dark"), block("cases", "Exemplos selecionáveis", ".radial-case-strip", 560)],
    cards: [block("formula", "Verificação passo a passo", ".radial-formula-stack", 500), block("hypotheses", "Aplicabilidade", ".radial-hypotheses", 500), block("conclusion", "Conclusão", ".radial-conclusion", 520), block("demand", "Controles da solicitação", ".radial-coordinate-controls", 440, "dark")],
  },
  "eixos-origem-sinais": {
    graphs: [graph("section", "Seção, forças e origem O′", ".origin-diagram-wrap")],
    controls: [block("parameters", "Eixos, origem e forças", ".origin-controls")],
    cards: [block("results", "Resultantes nas duas origens", ".origin-results", 540, "dark"), block("translation", "Contas da translação", ".origin-transform-panel", 580), block("forces", "Contribuição de cada força", ".origin-contributions-panel", 650)],
  },
};
