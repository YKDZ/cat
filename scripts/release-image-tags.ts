import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type ContainerTarget = "runtime" | "standalone";

export const releaseImageTags = (
  image: string,
  version: string,
  revision: string,
  target: ContainerTarget,
): string[] => {
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
    throw new Error(`Invalid release version ${JSON.stringify(version)}`);
  }
  if (!/^[a-f0-9]{40}$/.test(revision)) {
    throw new Error("Revision must be a full lowercase Git SHA");
  }
  const normalizedImage = image.toLowerCase();
  if (!/^[a-z0-9][a-z0-9./_-]*$/.test(normalizedImage)) {
    throw new Error(`Invalid image name ${JSON.stringify(image)}`);
  }
  const suffix = target === "runtime" ? "-runtime" : "";
  return [
    `${normalizedImage}:${version}${suffix}`,
    `${normalizedImage}:sha-${revision.slice(0, 12)}${suffix}`,
    `${normalizedImage}:latest${suffix}`,
  ];
};

const directExecution =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (directExecution) {
  const [image, version, revision, target] = process.argv.slice(2);
  if (
    image === undefined ||
    version === undefined ||
    revision === undefined ||
    (target !== "standalone" && target !== "runtime")
  ) {
    throw new Error(
      "Usage: release-image-tags.ts <image> <version> <revision> <standalone|runtime>",
    );
  }
  process.stdout.write(
    `${releaseImageTags(image, version, revision, target).join("\n")}\n`,
  );
}
