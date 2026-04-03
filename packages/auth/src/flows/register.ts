import type { AuthFlowDefinition } from "../types.ts";

export const registerFlow: AuthFlowDefinition = {
  id: "register",
  version: "1.0.0",
  description: "用户注册流程（邮箱 + 密码）",
  nodes: {
    "collect-identifier": {
      id: "collect-identifier",
      type: "credential_collector",
      clientHint: {
        componentType: "identifier_input",
        displayInfo: { title: "注册", description: "请输入邮箱地址" },
      },
    },
    "check-email-available": {
      id: "check-email-available",
      type: "decision_router",
      clientHint: { componentType: "none" },
    },
    "collect-password": {
      id: "collect-password",
      type: "credential_collector",
      factorId: "PASSWORD",
      clientHint: {
        componentType: "password_input",
        displayInfo: {
          title: "设置密码",
          description: "请设置一个安全的密码",
        },
      },
    },
    "create-account": {
      id: "create-account",
      type: "identity_resolver",
      clientHint: { componentType: "none" },
    },
    finalize: {
      id: "finalize",
      type: "session_finalizer",
      clientHint: { componentType: "none" },
    },
    "email-taken": {
      id: "email-taken",
      type: "decision_router",
      clientHint: { componentType: "none" },
    },
  },
  edges: [
    { from: "collect-identifier", to: "check-email-available" },
    {
      from: "check-email-available",
      to: "collect-password",
      condition: {
        field: "nodeOutputs.check-email-available.available",
        operator: "eq",
        value: true,
      },
    },
    {
      from: "check-email-available",
      to: "email-taken",
      condition: {
        field: "nodeOutputs.check-email-available.available",
        operator: "eq",
        value: false,
      },
    },
    { from: "collect-password", to: "create-account" },
    { from: "create-account", to: "finalize" },
  ],
  entry: "collect-identifier",
  terminalNodes: { success: ["finalize"], failure: ["email-taken"] },
  config: { maxSteps: 20, flowTTLSeconds: 600, requireCSRF: true },
};
