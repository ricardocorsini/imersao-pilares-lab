type LayerToggleProps = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export function LayerToggle({ label, checked, onChange }: LayerToggleProps) {
  return (
    <label className="layer-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="toggle-track" aria-hidden="true">
        <span className="toggle-thumb" />
      </span>
      <span>{label}</span>
    </label>
  );
}
