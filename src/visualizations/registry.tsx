import { lazy, Suspense, type ComponentType } from "react";
import { StrainPlaneLab } from "./StrainPlaneLab";

const InteractionLab = lazy(() => import("./InteractionLab"));
const FiberForceLab = lazy(() => import("./FiberForceLab"));
const MaterialLab = lazy(() => import("./MaterialLab"));
const ProjectedDistributionLab = lazy(() => import("./ProjectedDistributionLab"));
const ProjectedGeometryLab = lazy(() => import("./ProjectedGeometryLab"));
const LimitStateNavigatorLab = lazy(() => import("./LimitStateNavigatorLab"));
const RootSearchLab = lazy(() => import("./RootSearchLab"));
const InteractionConstructionLab = lazy(() => import("./InteractionConstructionLab"));
function InteractionModule() {
  return <Suspense fallback={<div role="status" className="interaction-loading">Carregando a superfície de interação…</div>}><InteractionLab /></Suspense>;
}
function FiberForceModule() {
  return <Suspense fallback={<div role="status" className="interaction-loading">Carregando as malhas e os exemplos…</div>}><FiberForceLab /></Suspense>;
}
function MaterialModule() {
  return <Suspense fallback={<div role="status" className="interaction-loading">Carregando os diagramas dos materiais…</div>}><MaterialLab /></Suspense>;
}
function ProjectedDistributionModule() {
  return <Suspense fallback={<div role="status" className="interaction-loading">Calculando as distribuições projetadas…</div>}><ProjectedDistributionLab /></Suspense>;
}
function ProjectedGeometryModule() {
  return <Suspense fallback={<div role="status" className="interaction-loading">Construindo a geometria projetada…</div>}><ProjectedGeometryLab /></Suspense>;
}
function LimitStateNavigatorModule() {
  return <Suspense fallback={<div role="status" className="interaction-loading">Percorrendo os estados-limites…</div>}><LimitStateNavigatorLab /></Suspense>;
}
function RootSearchModule() {
  return <Suspense fallback={<div role="status" className="interaction-loading">Construindo a curva e procurando raízes…</div>}><RootSearchLab /></Suspense>;
}
function InteractionConstructionModule() {
  return <Suspense fallback={<div role="status" className="interaction-loading">Construindo a curva ponto a ponto…</div>}><InteractionConstructionLab /></Suspense>;
}

export type VisualizationModule = {
  id: string;
  number: string;
  menuLabel: string;
  chapter: string;
  title: string;
  model: string;
  Component: ComponentType;
};

export const visualizationModules: VisualizationModule[] = [
  {
    id: "plano-de-deformacoes",
    number: "01",
    menuLabel: "Plano de deformações",
    chapter: "Plano de deformações",
    title: "Deformações e tensões na seção",
    model: "30 × 60 cm · C30 · CA-50 · 8 Ø16",
    Component: StrainPlaneLab,
  },
  {
    id: "curvas-de-interacao",
    number: "02",
    menuLabel: "Curvas de interação",
    chapter: "Diagramas resistentes",
    title: "Superfície de interação e cortes",
    model: "30 × 60 cm · C30 · CA-50 · 8 Ø16",
    Component: InteractionModule,
  },
  {
    id: "forcas-nas-fibras",
    number: "03",
    menuLabel: "Forças nas fibras",
    chapter: "Equilíbrio seccional",
    title: "Forças nas fibras e armaduras",
    model: "30 × 60 cm · C30 · CA-50 · 8 Ø16",
    Component: FiberForceModule,
  },
  {
    id: "materiais",
    number: "04",
    menuLabel: "Materiais",
    chapter: "Leis constitutivas",
    title: "Diagramas tensão–deformação",
    model: "Concretos C20–C90 · aço CA-50",
    Component: MaterialModule,
  },
  {
    id: "distribuicoes-projetadas",
    number: "05",
    menuLabel: "Distribuições na seção",
    chapter: "Compatibilidade e integração",
    title: "Deformações, tensões e forças ao longo de z",
    model: "30 × 60 cm · C30 · CA-50 · 8 Ø16",
    Component: ProjectedDistributionModule,
  },
  {
    id: "geometria-projetada",
    number: "06",
    menuLabel: "Geometria projetada",
    chapter: "Linha neutra e coordenadas",
    title: "Projeção da seção sobre p e z",
    model: "Seção retangular e seção L · barras Ø16",
    Component: ProjectedGeometryModule,
  },
  {
    id: "navegador-estados-limites",
    number: "07",
    menuLabel: "Estados-limites",
    chapter: "Domínios de deformação",
    title: "Navegador dos estados-limites",
    model: "Caminho t ∈ [0, 3] · C30 · CA-50 · 8 Ø16",
    Component: LimitStateNavigatorModule,
  },
  {
    id: "equilibrio-busca-raizes",
    number: "08",
    menuLabel: "Equilíbrio e raízes",
    chapter: "Equilíbrio por busca numérica",
    title: "Equilíbrio e busca de raízes",
    model: "NRd(t, θ) − NSd = 0 · varredura · bisseção · Brent",
    Component: RootSearchModule,
  },
  {
    id: "construcao-curva-interacao",
    number: "09",
    menuLabel: "Construção da curva",
    chapter: "Curvas de interação",
    title: "Construção da curva de interação",
    model: "NSd fixo · varredura de θ · raízes · Mx,Rd × My,Rd",
    Component: InteractionConstructionModule,
  },
];
