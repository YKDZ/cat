export type ReleaseImageTarget = "standalone" | "runtime";

export type ReleaseImage = {
  imageId: string;
  target: ReleaseImageTarget;
};

export type ImageBuildCommandRunnerOptions = {
  cwd: string;
  env: NodeJS.ProcessEnv;
  signal: AbortSignal;
  stdio: "inherit" | "pipe";
};

export type ImageBuildCommandRunner = (
  command: string,
  args: string[],
  options: ImageBuildCommandRunnerOptions,
) => Promise<{ stdout: string }>;

const releaseImageCapability = (
  target: ReleaseImageTarget,
): { command: string; description: string } =>
  target === "standalone"
    ? {
        command: "prepare-and-start",
        description: "CAT standalone application with database preparation",
      }
    : {
        command: "start-only",
        description: "CAT start-only application runtime",
      };

export type AssertReleaseE2eImageOptions = {
  cwd?: string;
  env: NodeJS.ProcessEnv;
  imageId: string | undefined;
  run: ImageBuildCommandRunner;
  signal: AbortSignal;
  target: ReleaseImageTarget;
};

export type AttestedReleaseE2eImage = ReleaseImage & {
  releaseIdentity: string;
};

type DockerImageInspection = {
  Config?: {
    Cmd?: unknown;
    Labels?: Record<string, unknown>;
  };
  Id?: unknown;
};

const immutableImageId = /^sha256:[a-f0-9]{64}$/;

const parseInspection = (
  value: string,
  imageId: string,
): DockerImageInspection => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(
      `Docker returned an invalid image inspection for ${imageId}`,
    );
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      `Docker returned an invalid image inspection for ${imageId}`,
    );
  }
  return parsed;
};

export const assertReleaseE2eImage = async (
  options: AssertReleaseE2eImageOptions,
): Promise<AttestedReleaseE2eImage> => {
  const imageId = options.imageId;
  if (imageId === undefined || !immutableImageId.test(imageId)) {
    throw new Error(
      "Release E2E requires an explicit immutable local image ID for its target",
    );
  }

  let inspected: { stdout: string };
  try {
    inspected = await options.run(
      "docker",
      ["image", "inspect", "--format", "{{json .}}", imageId],
      {
        cwd: options.cwd ?? process.cwd(),
        env: options.env,
        signal: options.signal,
        stdio: "pipe",
      },
    );
  } catch {
    throw new Error(`Release E2E image ${imageId} does not exist locally`);
  }

  const inspection = parseInspection(inspected.stdout, imageId);
  const capability = releaseImageCapability(options.target);
  const releaseIdentity =
    inspection.Config?.Labels?.["org.opencontainers.image.version"];
  if (
    inspection.Id !== imageId ||
    JSON.stringify(inspection.Config?.Cmd) !==
      JSON.stringify([capability.command]) ||
    inspection.Config?.Labels?.["org.opencontainers.image.description"] !==
      capability.description ||
    typeof releaseIdentity !== "string" ||
    releaseIdentity.trim() === ""
  ) {
    throw new Error(
      `Release E2E image ${imageId} does not satisfy the ${options.target} capability`,
    );
  }
  return { imageId, releaseIdentity, target: options.target };
};
