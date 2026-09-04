import { useMemo, useState } from "react";
import {
  Layers3,
  MousePointer2,
  RotateCcw,
} from "lucide-react";
import { LayerToggle } from "../components/LayerToggle";
import { RangeControl } from "../components/RangeControl";
import { ResultMetric } from "../components/ResultMetric";
import { ReferenceAppearanceControls } from "../components/ReferenceAppearanceControls";
import { DEFAULT_REFERENCE_APPEARANCE } from "../core/referenceAppearance";
import {
  CONCRETE,
  DEFAULT_PLANE,
  calculateSectionState,
  classifyStrainState,
  sigmaConcreteMaxMpa,
  steelDesignStrengthMpa,
  type PlaneParameters,
} from "../core/sectionModel";
import {
  SectionCanvas,
  type FieldMode,
  type LayerVisibility,
} from "./SectionScene";

type Preset = {
  id: string;
  label: string;
  description: string;
  parameters: PlaneParameters;
};

const PRESETS: Preset[] = [
  {
    id: "oblique",
    label: "Oblíqua",
    description: "Mesmo plano do exemplo 01 do flexopy",
    parameters: DEFAULT_PLANE,
  },
  {
    id: "uniform",
    label: "Compressão",
    description: "Deformação constante em toda a seção",
    parameters: {
      eps0PerMille: 2,
      gxPerMillePerM: 0,
      gyPerMillePerM: 0,
    },
  },
  {
    id: "mx",
    label: "Flexão Mₓ",
    description: "A deformação varia apenas ao longo de y",
    parameters: {
      eps0PerMille: 0.5,
      gxPerMillePerM: 0,
      gyPerMillePerM: 8,
    },
  },
  {
    id: "my",
    label: "Flexão Mᵧ",
    description: "A deformação varia apenas ao longo de x",
    parameters: {
      eps0PerMille: 0.5,
      gxPerMillePerM: 8,
      gyPerMillePerM: 0,
    },
  },
];

const INITIAL_LAYERS: LayerVisibility = {
  plane: true,
  fibers: true,
  rebars: true,
  neutralAxis: true,
  axes: true,
};

const resultFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const strainFormatter = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function sameParameters(first: PlaneParameters, second: PlaneParameters) {
  return (
    first.eps0PerMille === second.eps0PerMille &&
    first.gxPerMillePerM === second.gxPerMillePerM &&
    first.gyPerMillePerM === second.gyPerMillePerM
  );
}

function signed(value: number) {
  const formatted = resultFormatter.format(value);
  return value > 0 ? `+${formatted}` : formatted;
}

function stressLegend() {
  return (
    <div className="scene-legend" aria-label="Legenda das tensões">
      <div className="legend-block legend-concrete">
        <div className="legend-heading">
          <strong>Concreto · σc</strong>
          <span>0 → {sigmaConcreteMaxMpa.toFixed(1)} MPa</span>
        </div>
        <div className="legend-gradient concrete-gradient" aria-hidden="true" />
        <div className="legend-scale">
          <span>0</span>
          <span>0,5 σc,max</span>
          <span>σc,max</span>
        </div>
      </div>
      <div className="legend-block legend-steel">
        <div className="legend-heading">
          <strong>Barras · σs</strong>
          <span>±{steelDesignStrengthMpa.toFixed(0)} MPa</span>
        </div>
        <div className="legend-gradient steel-gradient" aria-hidden="true" />
        <div className="legend-scale">
          <span>−fyd</span>
          <span>0</span>
          <span>+fyd</span>
        </div>
      </div>
    </div>
  );
}

function strainLegend() {
  return (
    <div className="scene-legend" aria-label="Legenda das deformações">
      <div className="legend-block legend-strain">
        <div className="legend-heading">
          <strong>Deformação · ε</strong>
          <span>−10 → +3,5‰</span>
        </div>
        <div className="legend-gradient strain-gradient" aria-hidden="true" />
        <div className="legend-scale">
          <span>−10‰</span>
          <span>0</span>
          <span>+3,5‰</span>
        </div>
      </div>
    </div>
  );
}

export function StrainPlaneLab() {
  const [parameters, setParameters] =
    useState<PlaneParameters>(DEFAULT_PLANE);
  const [fieldMode, setFieldMode] = useState<FieldMode>("stress");
  const [layers, setLayers] = useState<LayerVisibility>(INITIAL_LAYERS);
  const [referenceAppearance, setReferenceAppearance] = useState(
    DEFAULT_REFERENCE_APPEARANCE,
  );
  const [cameraResetKey, setCameraResetKey] = useState(0);

  const state = useMemo(
    () => calculateSectionState(parameters),
    [parameters],
  );
  const activePreset = PRESETS.find((preset) =>
    sameParameters(preset.parameters, parameters),
  )?.id;

  const updateParameter = (
    key: keyof PlaneParameters,
    value: number,
  ) => {
    setParameters((current) => ({ ...current, [key]: value }));
  };

  const updateLayer = (key: keyof LayerVisibility, value: boolean) => {
    setLayers((current) => ({ ...current, [key]: value }));
  };

  const concreteMinimumPerMille = state.concreteStrainMin * 1_000;
  const concreteMaximumPerMille = state.concreteStrainMax * 1_000;
  const exceedsConcreteLimit = state.concreteStrainMax > CONCRETE.epsCu + 1e-10;
  const exceedsSteelReference = state.steelStrainMin < -0.01 - 1e-10;
  const sectionStateLabel = classifyStrainState(state);
  const isZeroPlane =
    Math.abs(parameters.eps0PerMille) < 1e-12 &&
    Math.abs(parameters.gxPerMillePerM) < 1e-12 &&
    Math.abs(parameters.gyPerMillePerM) < 1e-12;

  return (
    <div className="lab-shell">
      <div className="lab-grid">
        <section className="viewport-panel" aria-label="Visualização da seção">
          <div className="viewport-toolbar">
            <div
              className="segmented-control"
              role="group"
              aria-label="Grandeza mostrada nas cores"
            >
              <button
                type="button"
                className={fieldMode === "stress" ? "is-active" : ""}
                aria-pressed={fieldMode === "stress"}
                onClick={() => setFieldMode("stress")}
              >
                Tensão σ
              </button>
              <button
                type="button"
                className={fieldMode === "strain" ? "is-active" : ""}
                aria-pressed={fieldMode === "strain"}
                onClick={() => setFieldMode("strain")}
              >
                Deformação ε
              </button>
            </div>
            <button
              className="icon-button"
              type="button"
              onClick={() => setCameraResetKey((value) => value + 1)}
              aria-label="Restaurar vista isométrica"
              title="Restaurar vista isométrica"
            >
              <RotateCcw size={17} aria-hidden="true" />
              <span>Reenquadrar</span>
            </button>
          </div>

          <div className="scene-wrap">
            <SectionCanvas
              parameters={parameters}
              state={state}
              fieldMode={fieldMode}
              layers={layers}
              referenceAppearance={referenceAppearance}
              cameraResetKey={cameraResetKey}
            />
            <div className="sign-direction" aria-label="Sentido gráfico das deformações">
              <span className="sign-tension">↑ tração · ε &lt; 0</span>
              <span className="sign-zero">referência · ε = 0</span>
              <span className="sign-compression">↓ compressão · ε &gt; 0</span>
            </div>
            {fieldMode === "stress" ? stressLegend() : strainLegend()}
            <div className="scene-instruction">
              <MousePointer2 size={15} aria-hidden="true" />
              Girar · zoom
            </div>
          </div>
        </section>

        <aside className="controls-panel" aria-label="Controles do plano">
          <div className="controls-heading">
            <h3>Plano de deformações</h3>
            <span>ε &gt; 0 = compressão</span>
          </div>

          <div className="equation" aria-label="epsilon de x y igual a epsilon zero mais gê x vezes x mais gê y vezes y">
            <span>ε(x,y)</span>
            <b>=</b>
            <span>ε<sub>0</sub></span>
            <b>+</b>
            <span>g<sub>x</sub>x</span>
            <b>+</b>
            <span>g<sub>y</sub>y</span>
          </div>

          <div className="preset-group">
            <div className="control-section-label">Presets</div>
            <div className="preset-grid">
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={activePreset === preset.id ? "is-active" : ""}
                  aria-pressed={activePreset === preset.id}
                  title={preset.description}
                  onClick={() => setParameters(preset.parameters)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="range-stack">
            <RangeControl
              id="eps0"
              label="No centroide"
              symbol="ε₀"
              value={parameters.eps0PerMille}
              min={-5}
              max={5}
              step={0.1}
              unit="‰"
              onChange={(value) => updateParameter("eps0PerMille", value)}
            />
            <RangeControl
              id="gx"
              label="Gradiente em x"
              symbol="gₓ"
              value={parameters.gxPerMillePerM}
              min={-12}
              max={12}
              step={0.25}
              unit="‰/m"
              onChange={(value) =>
                updateParameter("gxPerMillePerM", value)
              }
            />
            <RangeControl
              id="gy"
              label="Gradiente em y"
              symbol="gᵧ"
              value={parameters.gyPerMillePerM}
              min={-12}
              max={12}
              step={0.25}
              unit="‰/m"
              onChange={(value) =>
                updateParameter("gyPerMillePerM", value)
              }
            />
          </div>

          <ReferenceAppearanceControls
            value={referenceAppearance}
            onChange={setReferenceAppearance}
          />

          <div className="layers-group">
            <div className="control-section-label">
              <Layers3 size={15} aria-hidden="true" />
              Camadas
            </div>
            <div className="layer-grid">
              <LayerToggle
                label="Plano"
                checked={layers.plane}
                onChange={(value) => updateLayer("plane", value)}
              />
              <LayerToggle
                label="Mapa"
                checked={layers.fibers}
                onChange={(value) => updateLayer("fibers", value)}
              />
              <LayerToggle
                label="Armadura"
                checked={layers.rebars}
                onChange={(value) => updateLayer("rebars", value)}
              />
              <LayerToggle
                label="Linha neutra"
                checked={layers.neutralAxis}
                onChange={(value) => updateLayer("neutralAxis", value)}
              />
              <LayerToggle
                label="Eixos"
                checked={layers.axes}
                onChange={(value) => updateLayer("axes", value)}
              />
            </div>
          </div>

          <div className="live-status" aria-live="polite">
            <span className="status-dot" aria-hidden="true" />
            <strong>{sectionStateLabel}</strong>
            <span>
              {state.neutralAxisCrossesSection
                ? `LN · ${state.neutralAxisAngleDeg?.toLocaleString("pt-BR", {
                    maximumFractionDigits: 1,
                  })}°`
                : isZeroPlane
                  ? "ε = 0 em toda a seção"
                  : "sem LN interna"}
            </span>
          </div>

          {(exceedsConcreteLimit || exceedsSteelReference) && (
            <div className="parameter-warning" role="status">
              Fora da referência:
              {exceedsConcreteLimit && exceedsSteelReference
                ? " εcu e 10‰."
                : exceedsConcreteLimit
                  ? " εcu = 3,5‰."
                  : " 10‰ no aço."}
            </div>
          )}
        </aside>
      </div>

      <section className="result-strip" aria-label="Resultantes calculadas">
        <ResultMetric
          label="Força normal"
          symbol="N"
          value={signed(state.nKn)}
          unit="kN"
        />
        <ResultMetric
          label="Momento em x"
          symbol="Mₓ"
          value={signed(state.mxKnm)}
          unit="kN·m"
        />
        <ResultMetric
          label="Momento em y"
          symbol="Mᵧ"
          value={signed(state.myKnm)}
          unit="kN·m"
        />
        <ResultMetric
          label="Faixa no concreto"
          symbol="εc"
          value={`${strainFormatter.format(concreteMinimumPerMille)} → ${strainFormatter.format(concreteMaximumPerMille)}`}
          unit="‰"
        />
      </section>
    </div>
  );
}
