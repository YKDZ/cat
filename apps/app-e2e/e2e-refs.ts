export const requiredE2ERefNames = [
  "content-node:elements",
  "glossary",
  "memory",
  "project",
  "user:admin",
] as const;

export type RequiredE2ERefName = (typeof requiredE2ERefNames)[number];

export type E2ERefs = Readonly<
  Partial<Record<string, string>> & Record<RequiredE2ERefName, string>
>;

const requireRef = (
  refs: Readonly<Partial<Record<string, string>>>,
  ref: RequiredE2ERefName,
  source: string,
): string => {
  const value = refs[ref];
  if (value === undefined) {
    throw new Error(`Required ref "${ref}" not found in ${source}.`);
  }
  return value;
};

export const parseE2ERefs = (value: unknown, source: string): E2ERefs => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Expected ${source} to contain an object of seed refs.`);
  }

  const refs: Record<string, string> = {};
  for (const [ref, id] of Object.entries(value)) {
    if (typeof id !== "string" || id.length === 0) {
      throw new Error(`Ref "${ref}" in ${source} must be a non-empty string.`);
    }
    refs[ref] = id;
  }

  return {
    ...refs,
    "content-node:elements": requireRef(refs, "content-node:elements", source),
    glossary: requireRef(refs, "glossary", source),
    memory: requireRef(refs, "memory", source),
    project: requireRef(refs, "project", source),
    "user:admin": requireRef(refs, "user:admin", source),
  };
};

export const parseE2ERefsJson = (raw: string, source: string): E2ERefs => {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to parse seed refs JSON from ${source}.`, {
      cause: error,
    });
  }
  return parseE2ERefs(value, source);
};
