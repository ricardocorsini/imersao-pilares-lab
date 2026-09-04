import { lazy, Suspense, type ComponentType } from "react";
import { StrainPlaneLab } from "./StrainPlaneLab";

const InteractionLab = lazy(() => import("./InteractionLab"));
const FiberForceLab = lazy(() => import("./FiberForceLab"));
function InteractionModule() {
  return <Suspense fallback={<div role="status" className="interaction-loading">Carregando a superfície de interação…</div>}><InteractionLab /></Suspense>;
}
function FiberForceModule() {
  return <Suspense fallback={<div role="status" className="interaction-loading">Carregando as malhas e os exemplos…</div>}><FiberForceLab /></Suspense>;
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
];
