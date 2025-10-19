export const toShortFixed = (
  num: number,
  fractionDigits: number = 1,
): string => {
  const fixed = num.toFixed(fractionDigits);
  return parseFloat(fixed).toString();
};
