const ZERO = "#f7f9ff";

type Rgb = [number, number, number];
type ColorStop = readonly [position: number, color: string];

const TENSION_STOPS: readonly ColorStop[] = [
  [0, ZERO],
  [0.22, "#67e8ff"],
  [0.5, "#00a6ff"],
  [0.78, "#1769ff"],
  [1, "#5b3df5"],
];

const COMPRESSION_STOPS: readonly ColorStop[] = [
  [0, ZERO],
  [0.18, "#ffe761"],
  [0.42, "#ffbd00"],
  [0.68, "#ff7600"],
  [0.86, "#ff3d21"],
  [1, "#ff174d"],
];

const CONCRETE_STRESS_STOPS: readonly ColorStop[] = [
  [0, "#071a34"],
  [0.08, "#273cff"],
  [0.28, "#00a6ff"],
  [0.48, "#00f5d4"],
  [0.66, "#7dff38"],
  [0.8, "#ffe600"],
  [0.92, "#ff7a00"],
  [1, "#ff174d"],
];

function clamp01(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgbToHex([r, g, b]: Rgb) {
  return `#${[r, g, b]
    .map((value) => Math.round(value).toString(16).padStart(2, "0"))
    .join("")}`;
}

function mix(first: string, second: string, amount: number) {
  const a = hexToRgb(first);
  const b = hexToRgb(second);
  const t = clamp01(amount);
  return rgbToHex([
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ]);
}

function sampleScale(stops: readonly ColorStop[], value: number) {
  const position = clamp01(value);
  for (let index = 1; index < stops.length; index += 1) {
    const [rightPosition, rightColor] = stops[index];
    if (position <= rightPosition) {
      const [leftPosition, leftColor] = stops[index - 1];
      const localPosition =
        (position - leftPosition) / (rightPosition - leftPosition);
      return mix(leftColor, rightColor, localPosition);
    }
  }
  return stops.at(-1)?.[1] ?? ZERO;
}

export function strainColor(strain: number) {
  if (strain < 0) {
    return sampleScale(TENSION_STOPS, Math.abs(strain) / 0.01);
  }
  return sampleScale(COMPRESSION_STOPS, strain / 0.0035);
}

export function concreteStressColor(
  stressMpa: number,
  maximumMpa: number,
  strain: number,
) {
  if (strain <= 0) return CONCRETE_STRESS_STOPS[0][1];
  return sampleScale(CONCRETE_STRESS_STOPS, stressMpa / maximumMpa);
}

export function steelStressColor(stressMpa: number, designStrengthMpa: number) {
  if (stressMpa < 0) {
    return sampleScale(TENSION_STOPS, Math.abs(stressMpa) / designStrengthMpa);
  }
  return sampleScale(COMPRESSION_STOPS, stressMpa / designStrengthMpa);
}
