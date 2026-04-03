import type { AuthFlowDefinition } from "../types.ts";

export const standardLoginFlow: AuthFlowDefinition = {
  id: "standard-login",
  version: "1.0.0",
  description: "标准密码登录流程，支持可选 MFA",
  nodes: {
    "collect-identifier": {
      id: "collect-identifier",
      type: "credential_collector",
      clientHint: {
        componentType: "identifier_input",
        displayInfo: { title: "登录", description: "请输入邮箱或用户名" },
      },
    },
    "resolve-identity": {
      id: "resolve-identity",
      type: "identity_resolver",
      clientHint: { componentType: "none" },
    },
    "check-user-exists": {
      id: "check-user-exists",
      type: "decision_router",
      clientHint: { componentType: "none" },
    },
    "collect-password": {
      id: "collect-password",
      type: "credential_collector",
      factorId: "PASSWORD",
      clientHint: {
        componentType: "password_input",
        displayInfo: { title: "输入密码" },
      },
    },
    "check-mfa": {
      id: "check-mfa",
      type: "decision_router",
      config: { checkMfaRequired: true },
      clientHint: { componentType: "none" },
    },
    "verify-mfa": {
      id: "verify-mfa",
      type: "challenge_verifier",
      clientHint: {
        componentType: "totp_input",
        displayInfo: {
          title: "两步验证",
          description: "请输入验证器应用中的 6 位数字",
        },
      },
    },
    finalize: {
      id: "finalize",
      type: "session_finalizer",
      clientHint: { componentType: "none" },
    },
    "user-not-found": {
      id: "user-not-found",
      type: "decision_router",
      clientHint: { componentType: "none" },
    },
  },
  edges: [
    { from: "collect-identifier", to: "resolve-identity" },
    { from: "resolve-identity", to: "check-user-exists" },
    {
      from: "check-user-exists",
      to: "collect-password",
      condition: {
        field: "nodeOutputs.resolve-identity.userFound",
        operator: "eq",
        value: true,
      },
    },
    {
      from: "check-user-exists",
      to: "user-not-found",
      condition: {
        field: "nodeOutputs.resolve-identity.userFound",
        operator: "eq",
        value: false,
      },
    },
    { from: "collect-password", to: "check-mfa" },
    {
      from: "check-mfa",
      to: "verify-mfa",
      condition: {
        field: "nodeOutputs.check-mfa.mfaRequired",
        operator: "eq",
        value: true,
      },
    },
    {
      from: "check-mfa",
      to: "finalize",
      condition: {
        field: "nodeOutputs.check-mfa.mfaRequired",
        operator: "eq",
        value: false,
      },
    },
    { from: "verify-mfa", to: "finalize" },
  ],
  entry: "collect-identifier",
  terminalNodes: { success: ["finalize"], failure: ["user-not-found"] },
  config: { maxSteps: 20, flowTTLSeconds: 600, requireCSRF: true },
};
