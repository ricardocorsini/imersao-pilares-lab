type ResultMetricProps = {
  label: string;
  symbol: string;
  value: string;
  unit?: string;
};

export function ResultMetric({
  label,
  symbol,
  value,
  unit,
}: ResultMetricProps) {
  return (
    <div className="result-metric">
      <div className="metric-label">
        <span>{symbol}</span>
        {label}
      </div>
      <div className="metric-number">
        {value} {unit && <small>{unit}</small>}
      </div>
    </div>
  );
}
