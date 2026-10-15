/** Estática de forças longitudinais na convenção escalar do curso.
 *
 * Forças em kN, coordenadas em mm e momentos apresentados em kN·m.
 * Compressão positiva; Mx = Σ(F·y), My = Σ(F·x).
 * As forças são fornecidas: este módulo não calcula resistência nem tensões.
 */
export type FramePoint = { xMm: number; yMm: number };
export type LongitudinalForce = FramePoint & {
  id: string;
  label: string;
  forceKn: number;
};
export type FrameResultants = { nKn: number; mxKnm: number; myKnm: number };
export type ForceContribution = LongitudinalForce & {
  xLocalMm: number;
  yLocalMm: number;
  mxKnm: number;
  myKnm: number;
};
export type FrameExample = {
  id: string;
  label: string;
  description: string;
  lesson: string;
  forces: readonly LongitudinalForce[];
};

export const ORIGIN_LIMITS = { xMm: 200, yMm: 350 };
export const FRAME_SECTION = { widthMm: 300, heightMm: 600 };

export const FRAME_EXAMPLES: readonly FrameExample[] = [
  {
    id: "eccentric-compression",
    label: "Compressão excêntrica",
    description: "Uma força positiva fora do centro produz momentos nos dois eixos.",
    lesson: "Leve O′ até a força: seus braços e os momentos relativos a O′ se anulam. A força continua excêntrica em relação ao centroide O.",
    forces: [{ id: "F1", label: "F₁", forceKn: 100, xMm: 100, yMm: 150 }],
  },
  {
    id: "centered-compression",
    label: "Compressão centrada",
    description: "A linha de ação passa pelo centroide O; os momentos iniciais são nulos.",
    lesson: "Afaste O′ do centro. Os momentos mudam porque a referência mudou; a carga permanece centrada em relação a O.",
    forces: [{ id: "F1", label: "F₁", forceKn: 100, xMm: 0, yMm: 0 }],
  },
  {
    id: "eccentric-tension",
    label: "Tração excêntrica",
    description: "A força negativa permite separar o sinal da força do sinal de suas coordenadas.",
    lesson: "Com os mesmos braços da compressão excêntrica, inverter F inverte N, Mx e My. Este exemplo é de estática; o gerador resistente do curso limita NSd ≥ 0.",
    forces: [{ id: "F1", label: "F₁", forceKn: -100, xMm: 100, yMm: 150 }],
  },
  {
    id: "couple",
    label: "Binário · N = 0",
    description: "Duas forças opostas têm resultante normal nula e produzem um momento não nulo.",
    lesson: "Mova O′: com N = 0, Mx′ = Mx e My′ = My. Levar a origem até uma das forças não elimina o momento do conjunto.",
    forces: [
      { id: "F1", label: "F₁", forceKn: 100, xMm: 0, yMm: 150 },
      { id: "F2", label: "F₂", forceKn: -100, xMm: 0, yMm: -150 },
    ],
  },
  {
    id: "symmetric-forces",
    label: "Forças simétricas",
    description: "Duas compressões iguais em posições opostas têm momentos que se cancelam em O.",
    lesson: "Observe a tabela: cada força contribui com sinais diferentes para os momentos. A soma é nula em O; ao mudar a origem, aparecem os termos −NΔy e −NΔx.",
    forces: [
      { id: "F1", label: "F₁", forceKn: 50, xMm: -100, yMm: 200 },
      { id: "F2", label: "F₂", forceKn: 50, xMm: 100, yMm: -200 },
    ],
  },
];

function finite(values: number[], name: string) {
  if (!values.every(Number.isFinite)) throw new Error(`${name}: use apenas valores finitos.`);
}

export function forceContributions(
  forces: readonly LongitudinalForce[],
  origin: FramePoint = { xMm: 0, yMm: 0 },
): ForceContribution[] {
  finite([origin.xMm, origin.yMm], "Origem");
  return forces.map((force) => {
    finite([force.forceKn, force.xMm, force.yMm], force.id);
    const xLocalMm = force.xMm - origin.xMm;
    const yLocalMm = force.yMm - origin.yMm;
    return {
      ...force,
      xLocalMm,
      yLocalMm,
      mxKnm: force.forceKn * yLocalMm / 1_000,
      myKnm: force.forceKn * xLocalMm / 1_000,
    };
  });
}

export function sumLongitudinalForces(
  forces: readonly LongitudinalForce[],
  origin: FramePoint = { xMm: 0, yMm: 0 },
): FrameResultants {
  return forceContributions(forces, origin).reduce<FrameResultants>(
    (sum, force) => ({
      nKn: sum.nKn + force.forceKn,
      mxKnm: sum.mxKnm + force.mxKnm,
      myKnm: sum.myKnm + force.myKnm,
    }),
    { nKn: 0, mxKnm: 0, myKnm: 0 },
  );
}

/** Δx e Δy são medidos da origem antiga para a nova; eixos paralelos. */
export function translateFrameResultants(
  original: FrameResultants,
  delta: FramePoint,
): FrameResultants {
  finite([original.nKn, original.mxKnm, original.myKnm, delta.xMm, delta.yMm], "Translação");
  return {
    nKn: original.nKn,
    mxKnm: original.mxKnm - original.nKn * delta.yMm / 1_000,
    myKnm: original.myKnm - original.nKn * delta.xMm / 1_000,
  };
}

export function computeReferenceFrame(forces: readonly LongitudinalForce[], origin: FramePoint) {
  const original = sumLongitudinalForces(forces);
  const shifted = sumLongitudinalForces(forces, origin);
  const translated = translateFrameResultants(original, origin);
  const residualKnm = Math.max(
    Math.abs(shifted.mxKnm - translated.mxKnm),
    Math.abs(shifted.myKnm - translated.myKnm),
  );
  const equivalentPoint = original.nKn === 0 ? null : {
    xMm: original.myKnm * 1_000 / original.nKn,
    yMm: original.mxKnm * 1_000 / original.nKn,
  };
  return {
    original,
    shifted,
    translated,
    origin,
    contributions: forceContributions(forces, origin),
    residualKnm,
    equivalentPoint,
  };
}

export type ReferenceFrameState = ReturnType<typeof computeReferenceFrame>;
