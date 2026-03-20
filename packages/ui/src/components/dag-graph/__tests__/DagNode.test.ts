import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";

import type { DagNodeData } from "../types";

import DagNode from "../DagNode.vue";

// Handle requires VueFlow context (useNode/useVueFlow). Stub it out.
vi.mock("@vue-flow/core", async (importOriginal) => {
  const original = await importOriginal<typeof import("@vue-flow/core")>();
  return {
    ...original,
    Handle: { template: "<div />" },
  };
});

// Vue Flow NodeProps has many required fields. Provide only what our template
// actually uses and cast to bypass strict type checking in test helpers.
const makeProps = (data: Partial<DagNodeData> = {}) =>
  ({
    id: "node-1",
    type: "custom",
    selected: false,
    data: {
      id: "node-1",
      label: "Test Node",
      type: "llm",
      isEntry: false,
      isExit: false,
      ...data,
    } satisfies DagNodeData,
    position: { x: 0, y: 0 },
    dimensions: { width: 180, height: 60 },
    resizing: false,
    events: {} as never,
    connectable: true,
    draggable: true,
    dragging: false,
    isValidSourcePos: () => true,
    isValidTargetPos: () => true,
    xPos: 0,
    yPos: 0,
    zIndex: 0,
  }) as unknown as InstanceType<typeof DagNode>["$props"];

describe("DagNode", () => {
  it("renders node label", () => {
    const wrapper = mount(DagNode, { props: makeProps() });
    expect(wrapper.text()).toContain("Test Node");
  });

  it("applies entry marker for entry node", () => {
    const wrapper = mount(DagNode, { props: makeProps({ isEntry: true }) });
    // Entry node renders a dot marker (rounded-full border with bg-primary)
    expect(wrapper.html()).toContain("bg-primary");
  });

  it("applies exit marker for exit node", () => {
    const wrapper = mount(DagNode, { props: makeProps({ isExit: true }) });
    // Exit node renders a dot marker with bg-green-500
    expect(wrapper.html()).toContain("bg-green-500");
  });

  it("shows running status without errors", () => {
    const wrapper = mount(DagNode, { props: makeProps({ status: "running" }) });
    expect(wrapper.text()).toContain("Test Node");
  });
});
