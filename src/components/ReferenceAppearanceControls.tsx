import { RotateCcw } from "lucide-react";
import {
  DEFAULT_REFERENCE_APPEARANCE,
  type ReferenceAppearance,
} from "../core/referenceAppearance";
import { RangeControl } from "./RangeControl";

type ReferenceAppearanceControlsProps = {
  value: ReferenceAppearance;
  onChange: (value: ReferenceAppearance) => void;
};

export function ReferenceAppearanceControls({
  value,
  onChange,
}: ReferenceAppearanceControlsProps) {
  return (
    <section className="reference-controls" aria-labelledby="reference-title">
      <div className="reference-controls-heading">
        <h4 id="reference-title">Seção fixa</h4>
        <button
          className="reference-reset"
          type="button"
          onClick={() => onChange({ ...DEFAULT_REFERENCE_APPEARANCE })}
          title="Restaurar somente a aparência da seção fixa"
          aria-label="Restaurar cor e opacidade da seção fixa"
        >
          <RotateCcw size={13} aria-hidden="true" />
          Padrão
        </button>
      </div>
      <RangeControl
        id="reference-opacity"
        label="Opacidade do plano"
        symbol="α"
        value={Math.round(value.opacity * 100)}
        min={0}
        max={100}
        step={1}
        unit="%"
        signed={false}
        fractionDigits={0}
        minLabel="Transparente"
        maxLabel="Opaca"
        onChange={(opacity) => onChange({ ...value, opacity: opacity / 100 })}
      />
      <div className="reference-color-row">
        <label htmlFor="reference-color">Cor da seção</label>
        <output htmlFor="reference-color">{value.color.toUpperCase()}</output>
        <input
          id="reference-color"
          type="color"
          value={value.color}
          onChange={(event) => onChange({ ...value, color: event.target.value })}
          title="Escolher cor da seção fixa"
        />
      </div>
    </section>
  );
}
