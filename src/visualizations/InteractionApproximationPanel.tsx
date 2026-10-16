import { GitCompareArrows, Info } from "lucide-react";
import { formatInteraction } from "../core/interactionMesh";
import type { InteractionDisplayMode, RadialComparison, UniaxialResistances } from "../core/nbrInteractionApproximation";

type Props = {
  mode: InteractionDisplayMode;
  onMode: (mode: InteractionDisplayMode) => void;
  alpha: number;
  onAlpha: (alpha: number) => void;
  section: UniaxialResistances;
  phiDeg: number;
  onPhi: (phiDeg: number) => void;
  comparison: RadialComparison | null;
};

export function InteractionApproximationPanel({ mode, onMode, alpha, onAlpha, section, phiDeg, onPhi, comparison }: Props) {
  return <section className="nbr-comparison-panel" aria-label="Comparação com o processo aproximado da NBR 6118">
    <header className="nbr-comparison-heading">
      <div>
        <h2><GitCompareArrows size={19} aria-hidden="true" />Fibras × processo aproximado</h2>
        <p>NBR 6118:2026 · item 17.2.5 · mesmos materiais, armaduras e força normal</p>
      </div>
      <div className="nbr-mode-buttons" role="group" aria-label="Modelos exibidos no visualizador">
        {([
          ["fibers", "Modelo por fibras"], ["overlay", "Sobrepor os dois"], ["approximate", "Só aproximado"],
        ] as [InteractionDisplayMode, string][]).map(([id, label]) => <button
          key={id} type="button" aria-pressed={mode === id} onClick={() => onMode(id)}>{label}</button>)}
      </div>
    </header>
    {mode !== "fibers" && <>
      <div className="nbr-comparison-body">
        <div className="nbr-expression-block">
          <span className="nbr-small-label">fronteira aproximada · N_Rd = N_Sd</span>
          <div className="nbr-expression" role="math" aria-label="Módulo de M Rd x dividido por M Rd xx, elevado a alfa, mais módulo de M Rd y dividido por M Rd yy, elevado a alfa, igual a um">
            <span className="nbr-power"><span className="nbr-fraction"><span>|M<sub>Rd,x</sub>|</span><span>M<sub>Rd,xx</sub></span></span><sup>α</sup></span>
            <span>+</span>
            <span className="nbr-power"><span className="nbr-fraction"><span>|M<sub>Rd,y</sub>|</span><span>M<sub>Rd,yy</sub></span></span><sup>α</sup></span>
            <span>= 1</span>
          </div>
          <p>Os denominadores vêm dos interceptos da curva por fibras: <b>My = 0 para Mxx</b> e <b>Mx = 0 para Myy</b>. Não são máximos de um ponto oblíquo.</p>
        </div>
        <div className="nbr-exponent-block">
          <label htmlFor="nbr-interaction-alpha">Expoente α da interação</label>
          <select id="nbr-interaction-alpha" value={alpha} onChange={event => onAlpha(Number(event.target.value))}>
            <option value={1.2}>1,20 · seção retangular</option>
            <option value={1}>1,00 · opção geral</option>
          </select>
          <p>α = 1 forma um losango; α = 1,2 arredonda os trechos entre os mesmos interceptos. Aqui x e y são os eixos principais da seção bruta.</p>
        </div>
        <div className="nbr-intercepts" aria-live="polite">
          <span className="nbr-small-label">no corte N = {formatInteraction(section.nKn)} kN</span>
          {section.status === "valid" ? <dl>
            <div><dt>M<sub>Rd,xx</sub> (+ / −)</dt><dd>+{formatInteraction(section.mxPositive)} / −{formatInteraction(section.mxNegative)} <small>kN·m</small></dd></div>
            <div><dt>M<sub>Rd,yy</sub> (+ / −)</dt><dd>+{formatInteraction(section.myPositive)} / −{formatInteraction(section.myNegative)} <small>kN·m</small></dd></div>
          </dl> : <p className="nbr-degenerate-note">{section.reason} Não se divide por capacidades nulas.</p>}
          <div className="nbr-model-legend"><span className="nbr-legend-fibers">linha contínua · fibras</span><span className="nbr-legend-approximate">linha tracejada · aproximado</span></div>
        </div>
      </div>
      <div className="nbr-radial-comparison">
        <label htmlFor="nbr-comparison-phi">Comparar na direção do momento <b>φ = {formatInteraction(phiDeg, 0)}°</b></label>
        <input id="nbr-comparison-phi" type="range" min={0} max={360} step={1} value={phiDeg}
          aria-valuetext={`${formatInteraction(phiDeg, 0)} graus`} onChange={event => onPhi(Number(event.target.value))} />
        <div className="nbr-radial-values" aria-live="polite">
          <span>R<sub>fibras</sub> <b>{comparison ? formatInteraction(comparison.fiberRadiusKnm) : "—"}</b> <small>kN·m</small></span>
          <span>R<sub>aprox.</sub> <b>{comparison ? formatInteraction(comparison.approximateRadiusKnm) : "—"}</b> <small>kN·m</small></span>
          <span className={comparison && comparison.differencePercent > 0.1 ? "is-larger" : ""}>ΔR <b>{comparison ? `${comparison.differencePercent > 0 ? "+" : ""}${formatInteraction(comparison.differencePercent)}%` : "—"}</b></span>
        </div>
        <p>φ é a direção do vetor M, não θ da linha neutra. ΔR = 100·(Raprox./Rfibras − 1): negativo = menor capacidade aproximada; positivo = maior. A comparação usa a expressão, não arredondamentos da tela.</p>
      </div>
      <div className="nbr-comparison-note"><Info size={15} aria-hidden="true" /><span>
        Comparação didática de resistência seccional, não dimensionamento de armadura. O modelo por fibras também é discretizado; o aproximado reaproveita suas resistências uniaxiais, sem calibrar α para coincidir com a curva. A superfície 3D é a repetição da expressão por níveis de N, com interpolação entre eles.
      </span></div>
    </>}
  </section>;
}
