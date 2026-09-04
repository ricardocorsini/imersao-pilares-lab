export type ReferenceAppearance = {
  /** Opacidade do preenchimento, entre 0 (transparente) e 1 (opaco). */
  opacity: number;
  color: string;
};

export const DEFAULT_REFERENCE_APPEARANCE: ReferenceAppearance = {
  opacity: 0.1,
  color: "#7bdcf3",
};
