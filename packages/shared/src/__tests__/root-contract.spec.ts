import { describe, expect, it } from "vitest";

import * as shared from "../index.ts";

describe("@cat/shared root contract", () => {
  it("exposes canonical root symbols", () => {
    expect(shared.AgentDefinitionMetadataSchema).toBeDefined();
    expect(shared.StoredAgentDefinitionSchema).toBeDefined();
    expect(shared.PermissionCheckSchema).toBeDefined();
    expect(shared.sanitizeFileName).toBeDefined();
  });

  it("does not leak deprecated or non-isomorphic names", () => {
    expect("AgentDefinitionSchema" in shared).toBe(false);
    expect("AgentDefinition" in shared).toBe(false);
    expect("BlobSchema" in shared).toBe(false);
    expect("Blob" in shared).toBe(false);
  });
});
