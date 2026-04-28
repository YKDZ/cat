import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { BranchManager } from "../branch-manager/index.js";

export interface ValidationResult {
  passed: boolean;
  checks: Array<{ name: string; passed: boolean; message: string }>;
}

export class ValidationGate {
  private readonly branchManager: BranchManager;

  constructor(workspaceRoot: string, repoFullName: string) {
    this.branchManager = new BranchManager(workspaceRoot, repoFullName);
  }

  validate(
    workspaceRoot: string,
    namespace: string | null,
    skipDocCheck = false,
  ): ValidationResult {
    const checks: ValidationResult["checks"] = [];

    const clean = this.branchManager.isClean();
    checks.push({
      name: "git-clean",
      passed: clean,
      message: clean ? "Working tree is clean" : "Working tree has uncommitted changes",
    });

    const conflicts = this.branchManager.hasConflicts();
    checks.push({
      name: "no-conflicts",
      passed: !conflicts,
      message: conflicts ? "Merge conflicts detected" : "No merge conflicts",
    });

    if (namespace && !skipDocCheck) {
      const specPath = resolve(workspaceRoot, "todo", namespace, "spec.md");
      const specExists = existsSync(specPath);
      checks.push({
        name: "spec-exists",
        passed: true,
        message: specExists
          ? `spec.md found at todo/${namespace}/spec.md`
          : `spec.md not found at todo/${namespace}/spec.md (optional)`,
      });
    }

    const passed = checks.every((c) => c.passed);
    return { passed, checks };
  }
}
