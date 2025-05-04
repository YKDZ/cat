import { BinaryToTextEncoding, createHash } from "crypto";

export const hash = (
  obj: object,
  algorithm = "sha256",
  encoding: BinaryToTextEncoding = "hex",
) => {
  const str = JSON.stringify(obj, Object.keys(obj).sort());
  const hash = createHash(algorithm);
  hash.update(str);
  return hash.digest(encoding);
};
