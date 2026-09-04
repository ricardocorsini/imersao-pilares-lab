import type { CSSProperties } from "react";

type RangeControlProps = {
  id: string;
  label: string;
  symbol: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  signed?: boolean;
  fractionDigits?: number;
  minLabel?: string;
  maxLabel?: string;
  onChange: (value: number) => void;
};

export function RangeControl({
  id,
  label,
  symbol,
  value,
  min,
  max,
  step,
  unit,
  signed = true,
  fractionDigits,
  minLabel,
  maxLabel,
  onChange,
}: RangeControlProps) {
  const progress = ((value - min) / (max - min)) * 100;
  const style = { "--range-progress": `${progress}%` } as CSSProperties;

  return (
    <div className="range-control">
      <div className="range-heading">
        <label htmlFor={id}>
          <span className="range-symbol">{symbol}</span>
          <span>{label}</span>
        </label>
        <output htmlFor={id} className="range-value">
          {signed && value > 0 ? "+" : ""}
          {value.toLocaleString("pt-BR", {
            minimumFractionDigits: fractionDigits ?? (value % 1 === 0 ? 1 : 2),
            maximumFractionDigits: fractionDigits ?? 2,
          })}{" "}
          <span>{unit}</span>
        </output>
      </div>
      <input
        id={id}
        className="range-input"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={style}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <div className="range-scale" aria-hidden="true">
        <span>{minLabel ?? min}</span>
        <span>{maxLabel ?? `${signed && max > 0 ? "+" : ""}${max}`}</span>
      </div>
    </div>
  );
}
