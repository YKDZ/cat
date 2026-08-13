import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  lstat,
  mkdtemp,
  mkdir,
  open,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { pipeline } from "node:stream/promises";

import {
  imageBuildFamilies,
  imageBuildFamilyTargets,
  releaseImageCapability,
  releaseImageTargets,
  type ImageBuildFamily,
  type ReleaseImageBuildResult,
  type ReleaseImageTarget,
} from "./image-builder.ts";

export const candidateBundleFiles = [
  "application-images.tar",
  "spacy-image.tar",
] as const;

export type CandidateBundleFile = (typeof candidateBundleFiles)[number];

export type CandidateImageBundle = {
  file: CandidateBundleFile;
  sha256: string;
};

export type CandidateImage = {
  bundle: CandidateImageBundle;
  capability: {
    command: string;
    description: string;
  };
  imageId: string;
  releaseIdentity: string;
  target: ReleaseImageTarget;
};

export type CandidateImageManifest = {
  candidates: Record<ReleaseImageTarget, CandidateImage>;
  commitIdentity: string;
  planIdentity: string;
  releaseIdentity: string;
  runIdentity: string;
  schemaVersion: 2;
};

export type CandidateIdentity = {
  commitIdentity: string;
  planIdentity: string;
  releaseIdentity: string;
  runIdentity: string;
};

export type CandidateImageArtifactRoot = {
  directory: string;
  ownerToken: string;
};

export type CandidateImageFamilyManifest = CandidateIdentity & {
  candidates: Partial<Record<ReleaseImageTarget, CandidateImage>>;
  family: ImageBuildFamily;
  schemaVersion: 2;
};

declare const candidateFamilyArtifactIdentityBrand: unique symbol;

export type CandidateFamilyArtifactIdentity = string & {
  readonly [candidateFamilyArtifactIdentityBrand]: true;
};

export type CandidateFamilyArtifactIdentityRecord =
  | {
      bundleSha256: string;
      family: "application";
      imageIds: Record<"runtime" | "standalone", string>;
      schemaVersion: 1;
    }
  | {
      bundleSha256: string;
      family: "spacy";
      imageIds: Record<"spacy", string>;
      schemaVersion: 1;
    };

export type CandidateBundleCommandRunner = (args: string[]) => Promise<string>;

export type WriteCandidateImageBundlesOptions = {
  commitIdentity: string;
  directory: string;
  images: ReleaseImageBuildResult;
  ownerToken: string;
  planIdentity: string;
  releaseIdentity: string;
  runIdentity: string;
  run: CandidateBundleCommandRunner;
};

export type WriteCandidateImageFamilyOptions = {
  directory: string;
  family: ImageBuildFamily;
  identity: CandidateIdentity;
  images: ReleaseImageBuildResult;
  ownerToken: string;
  run: CandidateBundleCommandRunner;
};

const immutableImageId = /^sha256:[a-f0-9]{64}$/;
const sha256Pattern = /^[a-f0-9]{64}$/;

const sha256 = async (path: string): Promise<string> => {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
};

const tarBlockSize = 512;
const maximumDockerMetadataSize = 16 * 1024 * 1024;
const tarText = (value: Buffer, encoding: BufferEncoding): string => {
  const terminator = value.indexOf(0);
  return value
    .subarray(0, terminator === -1 ? value.length : terminator)
    .toString(encoding);
};

const readTarEntries = async (
  path: string,
  wanted: ReadonlySet<string>,
): Promise<Map<string, Buffer>> => {
  const file = await open(path, "r");
  const entries = new Map<string, Buffer>();
  const header = Buffer.alloc(tarBlockSize);
  let offset = 0;
  try {
    while (true) {
      const read = await file.read(header, 0, header.length, offset);
      if (read.bytesRead === 0) break;
      if (read.bytesRead !== tarBlockSize) {
        throw new Error("Candidate Docker save bundle has a truncated header");
      }
      if (header.every((byte) => byte === 0)) break;
      const name = tarText(header.subarray(0, 100), "utf8");
      const prefix = tarText(header.subarray(345, 500), "utf8");
      const entry = prefix === "" ? name : `${prefix}/${name}`;
      const sizeText = tarText(header.subarray(124, 136), "ascii").trim();
      const size = Number.parseInt(sizeText === "" ? "0" : sizeText, 8);
      if (!Number.isSafeInteger(size) || size < 0) {
        throw new Error("Candidate Docker save bundle has invalid metadata");
      }
      const dataOffset = offset + tarBlockSize;
      if (wanted.has(entry)) {
        if (entries.has(entry)) {
          throw new Error(
            "Candidate Docker save bundle has duplicate metadata",
          );
        }
        const type = header.subarray(156, 157).toString("ascii");
        if (type !== "" && type !== "\0" && type !== "0") {
          throw new Error(
            "Candidate Docker save metadata is not a regular file",
          );
        }
        if (size > maximumDockerMetadataSize) {
          throw new Error("Candidate Docker save metadata is too large");
        }
        const data = Buffer.alloc(size);
        const value = await file.read(data, 0, size, dataOffset);
        if (value.bytesRead !== size) {
          throw new Error("Candidate Docker save bundle is truncated");
        }
        entries.set(entry, data);
      }
      offset = dataOffset + Math.ceil(size / tarBlockSize) * tarBlockSize;
    }
  } finally {
    await file.close();
  }
  return entries;
};

const dockerSaveConfig = (value: unknown): string => {
  if (!isRecord(value) || !isNonEmptyString(value.Config)) {
    throw new Error("Candidate Docker save manifest is malformed");
  }
  const config = value.Config;
  if (
    !/^blobs\/sha256\/[a-f0-9]{64}$/.test(config) &&
    !/^[a-f0-9]{64}\.json$/.test(config)
  ) {
    throw new Error("Candidate Docker save manifest has an invalid config");
  }
  return config;
};

const verifyDockerSaveBundle = async (
  path: string,
  expectedIds: ReadonlySet<string>,
): Promise<void> => {
  const manifestBytes = (
    await readTarEntries(path, new Set(["manifest.json"]))
  ).get("manifest.json");
  if (manifestBytes === undefined) {
    throw new Error("Candidate Docker save bundle has no manifest.json");
  }
  let value: unknown;
  try {
    value = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    throw new Error("Candidate Docker save manifest is malformed");
  }
  if (!Array.isArray(value) || value.length !== expectedIds.size) {
    throw new Error("Candidate Docker save bundle has an invalid image set");
  }
  const configs = value.map(dockerSaveConfig);
  if (new Set(configs).size !== configs.length) {
    throw new Error("Candidate Docker save bundle has duplicate images");
  }
  const configEntries = await readTarEntries(path, new Set(configs));
  const actualIds = new Set(
    configs.map((config) => {
      const bytes = configEntries.get(config);
      if (bytes === undefined) {
        throw new Error("Candidate Docker save bundle is missing image config");
      }
      const digest = createHash("sha256").update(bytes).digest("hex");
      const declaredDigest = /([a-f0-9]{64})(?:\.json)?$/.exec(config)?.[1];
      if (declaredDigest !== digest) {
        throw new Error("Candidate Docker save config digest does not match");
      }
      return `sha256:${digest}`;
    }),
  );
  if (
    actualIds.size !== expectedIds.size ||
    [...actualIds].some((imageId) => !expectedIds.has(imageId))
  ) {
    throw new Error(
      "Candidate Docker save bundle does not contain its declared image IDs",
    );
  }
};

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const candidateBundleFile = (
  target: ReleaseImageTarget,
): CandidateBundleFile =>
  target === "spacy" ? "spacy-image.tar" : "application-images.tar";

const candidateFamilyManifestFile = (family: ImageBuildFamily): string =>
  `${family}-manifest.json`;

const expectedTargets = new Set<string>(releaseImageTargets);
const ownerMarkerFile = ".cat-candidate-owner";

export const candidateFamilyArtifactIdentity = (
  manifest: CandidateImageFamilyManifest,
): CandidateFamilyArtifactIdentity => {
  const targets = [...imageBuildFamilyTargets(manifest.family)].sort();
  const candidates = targets.map((target) => manifest.candidates[target]);
  if (
    candidates.some(
      (candidate, index) =>
        candidate === undefined ||
        candidate.target !== targets[index] ||
        candidate.bundle.file !== candidateBundleFile(targets[index]!) ||
        !immutableImageId.test(candidate.imageId) ||
        !sha256Pattern.test(candidate.bundle.sha256),
    )
  ) {
    throw new Error(
      `Candidate ${manifest.family} family cannot produce an artifact identity`,
    );
  }
  const bundleSha256 = candidates[0]!.bundle.sha256;
  if (
    candidates.some((candidate) => candidate?.bundle.sha256 !== bundleSha256)
  ) {
    throw new Error(
      `Candidate ${manifest.family} family has inconsistent bundle identities`,
    );
  }
  const imageIdFor = (target: ReleaseImageTarget): string => {
    const candidate = manifest.candidates[target];
    if (candidate === undefined) {
      throw new Error(`Candidate ${manifest.family} family is incomplete`);
    }
    return candidate.imageId;
  };
  const record: CandidateFamilyArtifactIdentityRecord =
    manifest.family === "application"
      ? {
          bundleSha256,
          family: "application",
          imageIds: {
            runtime: imageIdFor("runtime"),
            standalone: imageIdFor("standalone"),
          },
          schemaVersion: 1,
        }
      : {
          bundleSha256,
          family: "spacy",
          imageIds: { spacy: imageIdFor("spacy") },
          schemaVersion: 1,
        };
  return JSON.stringify(record) as CandidateFamilyArtifactIdentity;
};

const assertTemporaryArtifactPath = (directory: string): string => {
  const resolved = resolve(directory);
  const pathFromTemp = relative(resolve(tmpdir()), resolved);
  if (
    pathFromTemp === "" ||
    pathFromTemp === ".." ||
    pathFromTemp.startsWith("../") ||
    isAbsolute(pathFromTemp) ||
    !basename(resolved).startsWith("cat-")
  ) {
    throw new Error(
      "Candidate image artifact directory must be beneath the temporary directory",
    );
  }
  return resolved;
};

const candidateImage = (
  value: unknown,
  target: ReleaseImageTarget,
): CandidateImage => {
  if (!isRecord(value)) {
    throw new Error(
      "Candidate image manifest has an invalid " + target + " entry",
    );
  }
  const bundle = value.bundle;
  const capability = value.capability;
  if (
    !isRecord(bundle) ||
    bundle.file !== candidateBundleFile(target) ||
    !isNonEmptyString(bundle.sha256) ||
    !sha256Pattern.test(bundle.sha256) ||
    !isRecord(capability) ||
    capability.command !== releaseImageCapability(target).command ||
    capability.description !== releaseImageCapability(target).description ||
    value.target !== target ||
    !isNonEmptyString(value.imageId) ||
    !immutableImageId.test(value.imageId) ||
    !isNonEmptyString(value.releaseIdentity)
  ) {
    throw new Error(
      "Candidate image manifest has an invalid " + target + " entry",
    );
  }
  return {
    bundle: { file: candidateBundleFile(target), sha256: bundle.sha256 },
    capability: {
      command: capability.command,
      description: capability.description,
    },
    imageId: value.imageId,
    releaseIdentity: value.releaseIdentity,
    target,
  };
};

const candidateBundlePath = (
  directory: string,
  file: CandidateBundleFile,
): string => {
  if (
    !candidateBundleFiles.includes(file) ||
    basename(file) !== file ||
    isAbsolute(file)
  ) {
    throw new Error("Candidate image manifest has an invalid bundle file");
  }
  const path = resolve(directory, file);
  const pathFromDirectory = relative(resolve(directory), path);
  if (
    pathFromDirectory === "" ||
    pathFromDirectory === ".." ||
    pathFromDirectory.startsWith("../") ||
    isAbsolute(pathFromDirectory)
  ) {
    throw new Error("Candidate image manifest has an invalid bundle file");
  }
  return path;
};

const ownerTokenHash = (ownerToken: string): string => {
  if (!isNonEmptyString(ownerToken)) {
    throw new Error("Candidate image artifact owner token is required");
  }
  return createHash("sha256").update(ownerToken).digest("hex");
};

const assertExistingAncestorsAreDirectories = async (
  directory: string,
): Promise<void> => {
  const tempRoot = await realpath(tmpdir());
  const pathFromTemp = relative(tempRoot, directory);
  let current = tempRoot;
  for (const segment of pathFromTemp.split("/")) {
    current = join(current, segment);
    try {
      const stats = await lstat(current);
      if (stats.isSymbolicLink() || !stats.isDirectory()) {
        throw new Error("Candidate image artifact path has an unsafe ancestor");
      }
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return;
      }
      throw error;
    }
  }
};

const validateOwnerMarker = async (
  directory: string,
  ownerToken: string,
): Promise<void> => {
  const marker = join(directory, ownerMarkerFile);
  const stats = await lstat(marker);
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error(
      "Candidate image artifact owner marker is not a regular file",
    );
  }
  if ((await readFile(marker, "utf8")).trim() !== ownerTokenHash(ownerToken)) {
    throw new Error("Candidate image artifact owner token does not match");
  }
};

const ensureArtifactDirectory = async (
  directory: string,
  ownerToken: string,
): Promise<string> => {
  const resolved = assertTemporaryArtifactPath(directory);
  await assertExistingAncestorsAreDirectories(resolved);
  const stats = await lstat(resolved);
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error(
      "Candidate image artifact directory is not a real directory",
    );
  }
  const canonical = assertTemporaryArtifactPath(await realpath(resolved));
  try {
    await validateOwnerMarker(canonical, ownerToken);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error("Candidate image artifact directory is not owned");
    }
    throw error;
  }
  return canonical;
};

export const initializeCandidateImageArtifacts = async (
  directory: string,
  ownerToken: string,
): Promise<string> => {
  const resolved = assertTemporaryArtifactPath(directory);
  await assertExistingAncestorsAreDirectories(resolved);
  try {
    await mkdir(resolved);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EEXIST") {
      return await ensureArtifactDirectory(resolved, ownerToken);
    }
    throw error;
  }
  const canonical = assertTemporaryArtifactPath(await realpath(resolved));
  await writeFile(
    join(canonical, ownerMarkerFile),
    ownerTokenHash(ownerToken) + "\n",
    {
      flag: "wx",
      mode: 0o600,
    },
  );
  return await ensureArtifactDirectory(canonical, ownerToken);
};

export const createCandidateImageArtifactRoot = async (
  ownerToken: string,
): Promise<CandidateImageArtifactRoot> => {
  const directory = await mkdtemp(join(tmpdir(), "cat-image-candidates-"));
  const marker = join(directory, ownerMarkerFile);
  await writeFile(marker, ownerTokenHash(ownerToken) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  await validateOwnerMarker(directory, ownerToken);
  return { directory, ownerToken };
};

export const cleanupCandidateImageArtifacts = async (
  directory: string,
  ownerToken: string,
): Promise<void> => {
  const resolved = assertTemporaryArtifactPath(directory);
  await assertExistingAncestorsAreDirectories(resolved);
  let stats;
  try {
    stats = await lstat(resolved);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error(
      "Candidate image artifact directory is not a real directory",
    );
  }
  const canonical = assertTemporaryArtifactPath(await realpath(resolved));
  await validateOwnerMarker(canonical, ownerToken);
  await assertExistingAncestorsAreDirectories(resolved);
  if ((await realpath(resolved)) !== canonical) {
    throw new Error("Candidate image artifact path changed during cleanup");
  }
  await rm(canonical, { force: true, recursive: true });
};

const safeArtifactFile = async (
  directory: string,
  file: string,
): Promise<string> => {
  if (basename(file) !== file || isAbsolute(file)) {
    throw new Error("Candidate artifact file escapes its directory");
  }
  const path = resolve(directory, file);
  const stats = await lstat(path);
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error(`Candidate artifact ${file} is not a regular file`);
  }
  const canonical = await realpath(path);
  const pathFromDirectory = relative(await realpath(directory), canonical);
  if (
    pathFromDirectory === "" ||
    pathFromDirectory === ".." ||
    pathFromDirectory.startsWith("../") ||
    isAbsolute(pathFromDirectory)
  ) {
    throw new Error(`Candidate artifact ${file} escapes its directory`);
  }
  return canonical;
};

export const createCandidateImageManifest = (
  images: ReleaseImageBuildResult,
  options: {
    bundleChecksums: Record<CandidateBundleFile, string>;
    commitIdentity: string;
    planIdentity: string;
    releaseIdentity: string;
    runIdentity: string;
  },
): CandidateImageManifest => {
  if (
    !isNonEmptyString(options.commitIdentity) ||
    !isNonEmptyString(options.planIdentity) ||
    !isNonEmptyString(options.releaseIdentity) ||
    !isNonEmptyString(options.runIdentity)
  ) {
    throw new Error(
      "Candidate image manifest requires plan and release identities",
    );
  }
  const imageFor = (target: ReleaseImageTarget): CandidateImage => {
    const image = images.images.find(
      (candidate) => candidate.target === target,
    );
    if (image === undefined || !immutableImageId.test(image.imageId)) {
      throw new Error(
        "Missing immutable " + target + " image for candidate export",
      );
    }
    const file = candidateBundleFile(target);
    const checksum = options.bundleChecksums[file];
    if (!sha256Pattern.test(checksum)) {
      throw new Error(
        "Candidate image manifest has an invalid " + file + " checksum",
      );
    }
    return {
      bundle: { file, sha256: checksum },
      capability: releaseImageCapability(target),
      imageId: image.imageId,
      releaseIdentity: options.releaseIdentity,
      target,
    };
  };
  return {
    candidates: {
      runtime: imageFor("runtime"),
      spacy: imageFor("spacy"),
      standalone: imageFor("standalone"),
    },
    commitIdentity: options.commitIdentity,
    planIdentity: options.planIdentity,
    releaseIdentity: options.releaseIdentity,
    runIdentity: options.runIdentity,
    schemaVersion: 2,
  };
};

export const writeCandidateImageChecksums = async (
  directory: string,
  ownerToken: string,
  write: (message: string) => void = (message) => process.stdout.write(message),
): Promise<void> => {
  const artifactDirectory = await ensureArtifactDirectory(
    directory,
    ownerToken,
  );
  const files = ["manifest.json", ...candidateBundleFiles] as const;
  const checksums: string[] = [];
  for (const file of files) {
    checksums.push(
      (await sha256(await safeArtifactFile(artifactDirectory, file))) +
        "  " +
        file,
    );
  }
  await writeFile(
    join(artifactDirectory, "SHA256SUMS"),
    checksums.join("\n") + "\n",
  );
  write(
    "image-artifact directory=" + artifactDirectory + " checksums=written\n",
  );
};

export const writeCandidateImageBundles = async (
  options: WriteCandidateImageBundlesOptions,
): Promise<CandidateImageManifest> => {
  const identity = {
    commitIdentity: options.commitIdentity,
    planIdentity: options.planIdentity,
    releaseIdentity: options.releaseIdentity,
    runIdentity: options.runIdentity,
  };
  try {
    await writeCandidateImageFamily({
      directory: options.directory,
      family: "application",
      identity,
      images: {
        images: options.images.images.filter(
          (image) => image.target !== "spacy",
        ),
      },
      ownerToken: options.ownerToken,
      run: options.run,
    });
    await writeCandidateImageFamily({
      directory: options.directory,
      family: "spacy",
      identity,
      images: {
        images: options.images.images.filter(
          (image) => image.target === "spacy",
        ),
      },
      ownerToken: options.ownerToken,
      run: options.run,
    });
    return await combineCandidateImageFamilies(
      options.directory,
      options.ownerToken,
    );
  } catch (error) {
    try {
      await cleanupCandidateImageArtifacts(
        options.directory,
        options.ownerToken,
      );
    } catch (cleanupError) {
      throw new AggregateError(
        [error, cleanupError],
        "Candidate image export and cleanup failed",
      );
    }
    throw error;
  }
};

export const writeCandidateImageFamily = async (
  options: WriteCandidateImageFamilyOptions,
): Promise<CandidateImageFamilyManifest> => {
  const directory = await ensureArtifactDirectory(
    options.directory,
    options.ownerToken,
  );
  const targets = imageBuildFamilyTargets(options.family);
  const actualTargets = options.images.images.map((image) => image.target);
  if (
    actualTargets.length !== targets.length ||
    actualTargets.some((target) => !targets.includes(target))
  ) {
    throw new Error(
      `Candidate ${options.family} family requires exactly ${targets.join(", ")}`,
    );
  }
  for (const value of Object.values(options.identity)) {
    if (!isNonEmptyString(value)) {
      throw new Error("Candidate family requires complete identities");
    }
  }
  const bundleFile = candidateBundleFile(targets[0] as ReleaseImageTarget);
  const bundlePath = candidateBundlePath(directory, bundleFile);
  const manifestPath = join(
    directory,
    candidateFamilyManifestFile(options.family),
  );
  try {
    await options.run([
      "image",
      "save",
      "--output",
      bundlePath,
      ...targets.map((target) => {
        const image = options.images.images.find(
          (candidate) => candidate.target === target,
        );
        if (image === undefined || !immutableImageId.test(image.imageId)) {
          throw new Error(
            `Missing immutable ${target} image for candidate export`,
          );
        }
        return image.imageId;
      }),
    ]);
    const bundleChecksum = await sha256(bundlePath);
    const candidates = Object.fromEntries(
      targets.map((target) => {
        const image = options.images.images.find(
          (candidate) => candidate.target === target,
        );
        if (image === undefined) throw new Error(`Missing ${target} image`);
        return [
          target,
          {
            bundle: { file: bundleFile, sha256: bundleChecksum },
            capability: releaseImageCapability(target),
            imageId: image.imageId,
            releaseIdentity: options.identity.releaseIdentity,
            target,
          },
        ];
      }),
    ) as Partial<Record<ReleaseImageTarget, CandidateImage>>;
    const manifest: CandidateImageFamilyManifest = {
      ...options.identity,
      candidates,
      family: options.family,
      schemaVersion: 2,
    };
    await writeFile(manifestPath, JSON.stringify(manifest) + "\n");
    return manifest;
  } catch (error) {
    await Promise.all([
      rm(bundlePath, { force: true }),
      rm(manifestPath, { force: true }),
    ]);
    throw error;
  }
};

export const readCandidateImageFamilyManifest = async (
  directory: string,
  ownerToken: string,
  family: ImageBuildFamily,
): Promise<CandidateImageFamilyManifest> => {
  const artifactDirectory = await ensureArtifactDirectory(
    directory,
    ownerToken,
  );
  const value: unknown = JSON.parse(
    await readFile(
      await safeArtifactFile(
        artifactDirectory,
        candidateFamilyManifestFile(family),
      ),
      "utf8",
    ),
  );
  if (
    !isRecord(value) ||
    value.schemaVersion !== 2 ||
    value.family !== family ||
    !isNonEmptyString(value.commitIdentity) ||
    !isNonEmptyString(value.planIdentity) ||
    !isNonEmptyString(value.releaseIdentity) ||
    !isNonEmptyString(value.runIdentity) ||
    !isRecord(value.candidates)
  ) {
    throw new Error(`Candidate ${family} family manifest is invalid`);
  }
  const targets = imageBuildFamilyTargets(family);
  const rawCandidates = value.candidates;
  const keys = Object.keys(rawCandidates);
  if (
    keys.length !== targets.length ||
    keys.some((key) => !targets.includes(key as ReleaseImageTarget))
  ) {
    throw new Error(`Candidate ${family} family manifest has invalid targets`);
  }
  const candidates = Object.fromEntries(
    targets.map((target) => [
      target,
      candidateImage(rawCandidates[target], target),
    ]),
  ) as Partial<Record<ReleaseImageTarget, CandidateImage>>;
  if (
    Object.values(candidates).some(
      (candidate) => candidate?.releaseIdentity !== value.releaseIdentity,
    )
  ) {
    throw new Error(
      `Candidate ${family} family candidate release identity does not match`,
    );
  }
  return {
    candidates,
    commitIdentity: value.commitIdentity,
    family,
    planIdentity: value.planIdentity,
    releaseIdentity: value.releaseIdentity,
    runIdentity: value.runIdentity,
    schemaVersion: 2,
  };
};

export const assertCandidateFamilyIdentity = (
  manifest: CandidateImageFamilyManifest,
  expected: CandidateIdentity,
): void => {
  for (const [name, actual, wanted] of [
    ["commit", manifest.commitIdentity, expected.commitIdentity],
    ["plan", manifest.planIdentity, expected.planIdentity],
    ["release", manifest.releaseIdentity, expected.releaseIdentity],
    ["run", manifest.runIdentity, expected.runIdentity],
  ] as const) {
    if (!isNonEmptyString(wanted) || actual !== wanted) {
      throw new Error(`Candidate image ${name} identity does not match`);
    }
  }
};

export const verifyCandidateImageFamily = async (
  directory: string,
  ownerToken: string,
  family: ImageBuildFamily,
  expectedIdentity?: CandidateIdentity,
): Promise<CandidateImageFamilyManifest> => {
  const artifactDirectory = await ensureArtifactDirectory(
    directory,
    ownerToken,
  );
  const manifest = await readCandidateImageFamilyManifest(
    artifactDirectory,
    ownerToken,
    family,
  );
  if (expectedIdentity !== undefined) {
    assertCandidateFamilyIdentity(manifest, expectedIdentity);
  }
  const targets = imageBuildFamilyTargets(family);
  const bundleFile = candidateBundleFile(targets[0] as ReleaseImageTarget);
  const bundle = await safeArtifactFile(artifactDirectory, bundleFile);
  const bundleChecksum = await sha256(bundle);
  const expectedIds = new Set<string>();
  for (const target of targets) {
    const candidate = manifest.candidates[target];
    if (
      candidate === undefined ||
      candidate.bundle.file !== bundleFile ||
      candidate.bundle.sha256 !== bundleChecksum
    ) {
      throw new Error(
        `Candidate ${family} family bundle checksum does not match`,
      );
    }
    expectedIds.add(candidate.imageId);
  }
  await verifyDockerSaveBundle(bundle, expectedIds);
  return manifest;
};

export const loadCandidateImageFamily = async (
  directory: string,
  ownerToken: string,
  manifest: CandidateImageFamilyManifest,
  run: CandidateBundleCommandRunner,
): Promise<void> => {
  const artifactDirectory = await ensureArtifactDirectory(
    directory,
    ownerToken,
  );
  const targets = imageBuildFamilyTargets(manifest.family);
  const bundleFile = candidateBundleFile(targets[0] as ReleaseImageTarget);
  const bundle = await safeArtifactFile(artifactDirectory, bundleFile);
  const expectedIds = new Set(
    targets.map((target) => {
      const candidate = manifest.candidates[target];
      if (candidate === undefined) {
        throw new Error(
          `Candidate ${manifest.family} family is missing ${target}`,
        );
      }
      return candidate.imageId;
    }),
  );
  await verifyDockerSaveBundle(bundle, expectedIds);
  await run(["image", "load", "--input", bundle]);
};

export const combineCandidateImageFamilies = async (
  directory: string,
  ownerToken: string,
): Promise<CandidateImageManifest> => {
  const artifactDirectory = await ensureArtifactDirectory(
    directory,
    ownerToken,
  );
  const application = await verifyCandidateImageFamily(
    artifactDirectory,
    ownerToken,
    "application",
  );
  const spacy = await verifyCandidateImageFamily(
    artifactDirectory,
    ownerToken,
    "spacy",
  );
  for (const key of [
    "commitIdentity",
    "planIdentity",
    "releaseIdentity",
    "runIdentity",
  ] as const) {
    if (
      !isNonEmptyString(application[key]) ||
      application[key] !== spacy[key]
    ) {
      throw new Error(`Candidate families have inconsistent ${key}`);
    }
  }
  const images = {
    images: releaseImageTargets.map((target) => {
      const candidate =
        application.candidates[target] ?? spacy.candidates[target];
      if (candidate === undefined) {
        throw new Error(`Candidate families are missing ${target}`);
      }
      return { imageId: candidate.imageId, target };
    }),
  };
  const manifest = createCandidateImageManifest(images, {
    bundleChecksums: {
      "application-images.tar": await sha256(
        await safeArtifactFile(artifactDirectory, "application-images.tar"),
      ),
      "spacy-image.tar": await sha256(
        await safeArtifactFile(artifactDirectory, "spacy-image.tar"),
      ),
    },
    commitIdentity: application.commitIdentity,
    planIdentity: application.planIdentity,
    releaseIdentity: application.releaseIdentity,
    runIdentity: application.runIdentity,
  });
  await writeFile(
    join(artifactDirectory, "manifest.json"),
    JSON.stringify(manifest) + "\n",
  );
  await writeCandidateImageChecksums(artifactDirectory, ownerToken);
  await Promise.all(
    imageBuildFamilies.map(
      async (family) =>
        await rm(join(artifactDirectory, candidateFamilyManifestFile(family)), {
          force: true,
        }),
    ),
  );
  return manifest;
};

const readChecksums = async (
  directory: string,
): Promise<Map<string, string>> => {
  const value = await readFile(
    await safeArtifactFile(directory, "SHA256SUMS"),
    "utf8",
  );
  const checksums = new Map<string, string>();
  for (const line of value.trim().split("\n")) {
    const match = /^([a-f0-9]{64})  ([A-Za-z0-9._-]+)$/.exec(line);
    if (match === null) {
      throw new Error("Candidate image checksum file is malformed");
    }
    const checksum = match[1];
    const file = match[2];
    if (checksum === undefined || file === undefined || checksums.has(file)) {
      throw new Error("Candidate image checksum file is malformed");
    }
    checksums.set(file, checksum);
  }
  return checksums;
};

export const readCandidateImageManifest = async (
  directory: string,
  ownerToken: string,
): Promise<CandidateImageManifest> => {
  const artifactDirectory = await ensureArtifactDirectory(
    directory,
    ownerToken,
  );
  let value: unknown;
  try {
    value = JSON.parse(
      await readFile(
        await safeArtifactFile(artifactDirectory, "manifest.json"),
        "utf8",
      ),
    );
  } catch (error) {
    throw new Error(
      "Candidate image manifest is not readable: " +
        (error instanceof Error ? error.message : String(error)),
    );
  }
  if (
    !isRecord(value) ||
    value.schemaVersion !== 2 ||
    !isNonEmptyString(value.commitIdentity) ||
    !isNonEmptyString(value.planIdentity) ||
    !isNonEmptyString(value.releaseIdentity) ||
    !isNonEmptyString(value.runIdentity) ||
    !isRecord(value.candidates)
  ) {
    throw new Error("Candidate image manifest has an unsupported schema");
  }
  const keys = Object.keys(value.candidates);
  if (
    keys.length !== releaseImageTargets.length ||
    keys.some((key) => !expectedTargets.has(key))
  ) {
    throw new Error("Candidate image manifest has an invalid target set");
  }
  const candidates = {
    runtime: candidateImage(value.candidates.runtime, "runtime"),
    spacy: candidateImage(value.candidates.spacy, "spacy"),
    standalone: candidateImage(value.candidates.standalone, "standalone"),
  };
  if (
    candidates.runtime.releaseIdentity !== value.releaseIdentity ||
    candidates.standalone.releaseIdentity !== value.releaseIdentity ||
    candidates.runtime.releaseIdentity !== candidates.standalone.releaseIdentity
  ) {
    throw new Error(
      "Candidate image manifest application candidates have inconsistent release identities",
    );
  }
  if (
    candidates.runtime.bundle.file !== candidates.standalone.bundle.file ||
    candidates.runtime.bundle.sha256 !== candidates.standalone.bundle.sha256 ||
    candidates.spacy.bundle.file === candidates.runtime.bundle.file ||
    candidates.spacy.releaseIdentity !== value.releaseIdentity
  ) {
    throw new Error(
      "Candidate image manifest has an invalid build family mapping",
    );
  }
  return {
    candidates,
    commitIdentity: value.commitIdentity,
    planIdentity: value.planIdentity,
    releaseIdentity: value.releaseIdentity,
    runIdentity: value.runIdentity,
    schemaVersion: 2,
  };
};

export const assertCandidateIdentity = (
  manifest: CandidateImageManifest,
  expected: CandidateIdentity,
): void => {
  for (const [name, actual, wanted] of [
    ["commit", manifest.commitIdentity, expected.commitIdentity],
    ["plan", manifest.planIdentity, expected.planIdentity],
    ["release", manifest.releaseIdentity, expected.releaseIdentity],
    ["run", manifest.runIdentity, expected.runIdentity],
  ] as const) {
    if (!isNonEmptyString(wanted) || actual !== wanted) {
      throw new Error(`Candidate image ${name} identity does not match`);
    }
  }
};

export const verifyCandidateImageBundles = async (
  directory: string,
  ownerToken: string,
  expectedIdentity?: CandidateIdentity,
): Promise<CandidateImageManifest> => {
  const artifactDirectory = await ensureArtifactDirectory(
    directory,
    ownerToken,
  );
  const manifest = await readCandidateImageManifest(
    artifactDirectory,
    ownerToken,
  );
  if (expectedIdentity !== undefined) {
    assertCandidateIdentity(manifest, expectedIdentity);
  }
  const checksums = await readChecksums(artifactDirectory);
  const expectedFiles = new Set(["manifest.json", ...candidateBundleFiles]);
  if (
    checksums.size !== expectedFiles.size ||
    [...checksums.keys()].some((file) => !expectedFiles.has(file))
  ) {
    throw new Error("Candidate image checksum file has an invalid file set");
  }
  for (const file of expectedFiles) {
    const checksum = checksums.get(file);
    if (
      checksum === undefined ||
      checksum !==
        (await sha256(await safeArtifactFile(artifactDirectory, file)))
    ) {
      throw new Error("Candidate image checksum does not match " + file);
    }
  }
  for (const candidate of Object.values(manifest.candidates)) {
    const bundlePath = await safeArtifactFile(
      artifactDirectory,
      candidate.bundle.file,
    );
    if ((await sha256(bundlePath)) !== candidate.bundle.sha256) {
      throw new Error(
        "Candidate image manifest checksum does not match " +
          candidate.bundle.file,
      );
    }
  }
  return manifest;
};

export const loadCandidateImageBundles = async (
  directory: string,
  ownerToken: string,
  manifest: CandidateImageManifest,
  run: CandidateBundleCommandRunner,
): Promise<void> => {
  const artifactDirectory = await ensureArtifactDirectory(
    directory,
    ownerToken,
  );
  for (const file of candidateBundleFiles) {
    const expectedIds = new Set(
      Object.values(manifest.candidates)
        .filter((candidate) => candidate.bundle.file === file)
        .map((candidate) => candidate.imageId),
    );
    const bundle = await safeArtifactFile(artifactDirectory, file);
    await verifyDockerSaveBundle(bundle, expectedIds);
    await run(["image", "load", "--input", bundle]);
  }
};
