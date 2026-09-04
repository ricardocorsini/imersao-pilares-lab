export const STRAIN_VERTICAL_SCALE = 420;

/**
 * Converte deformação em altura exclusivamente gráfica.
 *
 * O cálculo preserva a convenção do FlexoPy (compressão positiva). Na cena,
 * o sinal é invertido para que tração apareça acima da seção e compressão
 * abaixo dela, evitando sugerir alongamento quando a fibra está comprimida.
 */
export function strainToVisualHeight(strain: number) {
  if (strain === 0) return 0;
  return -strain * STRAIN_VERTICAL_SCALE;
}
