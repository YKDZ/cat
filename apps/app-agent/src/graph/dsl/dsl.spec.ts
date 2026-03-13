import { describe, expect, it } from "vitest";

import { compileGraphDSL } from "@/graph/dsl/compiler";
import { parseGraphDSL } from "@/graph/dsl/parser";
import { validateGraphDSL } from "@/graph/dsl/validator";

const validGraphDslObject = {
  id: "dsl-test-graph",
  nodes: {
    start: {
      id: "start",
      type: "transform",
      timeoutMs: 1000,
    },
  },
  edges: [],
  entry: "start",
  exit: ["start"],
};

describe("graph dsl", () => {
  it("parseGraphDSL 支持 JSON 字符串输入", () => {
    const parsed = parseGraphDSL(JSON.stringify(validGraphDslObject));

    expect(parsed.id).toBe("dsl-test-graph");
    expect(parsed.entry).toBe("start");
  });

  it("parseGraphDSL 支持 nodes 数组归一化", () => {
    const parsed = parseGraphDSL({
      ...validGraphDslObject,
      nodes: [
        {
          id: "start",
          type: "transform",
          timeoutMs: 1000,
        },
      ],
    });

    expect(parsed.nodes.start).toBeDefined();
    expect(parsed.nodes.start.id).toBe("start");
  });

  it("validateGraphDSL 在语义错误时返回失败", () => {
    const result = validateGraphDSL({
      ...validGraphDslObject,
      edges: [{ from: "start", to: "missing" }],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain(
        "Edge target node not found",
      );
    }
  });

  it("validateGraphDSL 在合法 DSL 时返回成功", () => {
    const result = validateGraphDSL(validGraphDslObject);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("dsl-test-graph");
    }
  });

  it("compileGraphDSL 对非法 DSL 抛出异常", () => {
    expect(() =>
      compileGraphDSL({
        ...validGraphDslObject,
        entry: "not-exist",
      }),
    ).toThrowError();
  });

  it("compileGraphDSL 对合法 DSL 返回 GraphDefinition", () => {
    const compiled = compileGraphDSL(validGraphDslObject);
    expect(compiled.id).toBe("dsl-test-graph");
    expect(compiled.entry).toBe("start");
  });
});
