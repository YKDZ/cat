export const sanitizeFileName = (name: string): string => {
  return name.replace(/[^\w.-]/g, "_");
};
