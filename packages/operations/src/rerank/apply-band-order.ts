export const applyBandOrder = <T>(
  ranked: T[],
  band: { start: number; end: number },
  orderedBand: T[],
): T[] => {
  return [
    ...ranked.slice(0, band.start),
    ...orderedBand,
    ...ranked.slice(band.end),
  ];
};
