import {
  NormalizedLanguageIdSchema,
  LanguageAnalysisRequirementStatusSchema,
  LanguageAnalysisSelectionSourceSchema,
  TermRecallStreamEventSchema,
  type NormalizedLanguageId,
} from "@cat/shared";

import { test, expect } from "#/fixtures.ts";
import { gotoHydrated } from "#/pages/app-navigation.ts";

type ObservationTiming =
  | { assessmentStatus: "UNKNOWN"; observationStatus: null }
  | { assessmentStatus: "SATISFIED"; observationStatus: "SATISFIED" };

const parseTermRecallStreamEvents = (body: string) =>
  body.split(/\r?\n\r?\n/).flatMap((frame) => {
    const data = frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim())
      .join("\n");
    if (data.length === 0) return [];
    const encoded: unknown = JSON.parse(data);
    const event =
      typeof encoded === "object" && encoded !== null && "json" in encoded
        ? encoded.json
        : encoded;
    if (
      typeof event !== "object" ||
      event === null ||
      !["CANDIDATE", "COMPLETED"].includes(Reflect.get(event, "type") as string)
    ) {
      return [];
    }
    return [TermRecallStreamEventSchema.parse(event)];
  });

const parseObservationTiming = (
  body: unknown,
  languageId: NormalizedLanguageId,
): ObservationTiming => {
  if (typeof body !== "object" || body === null) {
    throw new Error("Language Analysis response body is not an object");
  }
  const views = Reflect.get(body, "json");
  if (!Array.isArray(views)) {
    throw new Error("Language Analysis response did not include a view array");
  }
  const view = views.find(
    (candidate) =>
      typeof candidate === "object" &&
      candidate !== null &&
      Reflect.get(candidate, "languageId") === languageId,
  );
  if (typeof view !== "object" || view === null) {
    throw new Error(`Language Analysis response did not include ${languageId}`);
  }
  LanguageAnalysisSelectionSourceSchema.parse(Reflect.get(view, "source"));
  const assessment = Reflect.get(view, "assessment");
  if (typeof assessment !== "object" || assessment === null) {
    throw new Error("Language Analysis view did not include an assessment");
  }
  const assessmentStatus = LanguageAnalysisRequirementStatusSchema.parse(
    Reflect.get(assessment, "status"),
  );
  const observation = Reflect.get(view, "observation");
  if (assessmentStatus === "UNKNOWN" && observation === null) {
    return { assessmentStatus, observationStatus: null };
  }
  if (assessmentStatus === "SATISFIED") {
    if (typeof observation !== "object" || observation === null) {
      throw new Error("Satisfied Language Analysis view has no observation");
    }
    const observationAssessment = Reflect.get(observation, "assessment");
    if (
      typeof observationAssessment !== "object" ||
      observationAssessment === null
    ) {
      throw new Error("Language Analysis observation has no assessment");
    }
    const observationStatus = LanguageAnalysisRequirementStatusSchema.parse(
      Reflect.get(observationAssessment, "status"),
    );
    if (observationStatus === "SATISFIED") {
      return { assessmentStatus, observationStatus };
    }
  }
  throw new Error(
    `Unexpected Language Analysis observation timing: ${assessmentStatus}`,
  );
};

test.describe("Language Analysis policy surfaces", () => {
  test("admin CAS conflict preserves the losing operator input", async ({
    page,
  }) => {
    const competingPage = await page.context().newPage();
    try {
      await Promise.all([
        gotoHydrated(page, "/admin/language-analysis"),
        gotoHydrated(competingPage, "/admin/language-analysis"),
      ]);

      const winningLanguageInput = page.getByRole("textbox", {
        name: "Language",
      });
      const losingLanguageInput = competingPage.getByRole("textbox", {
        name: "Language",
      });
      const winningImplementationSelect = page.locator("form select");
      const losingImplementationSelect = competingPage.locator("form select");
      await Promise.all([
        expect(winningImplementationSelect.locator("option")).toHaveCount(2),
        expect(losingImplementationSelect.locator("option")).toHaveCount(2),
      ]);
      await winningLanguageInput.fill("en");
      await losingLanguageInput.fill("en");
      await winningImplementationSelect.selectOption({ index: 1 });
      await losingImplementationSelect.selectOption({ index: 1 });
      const losingImplementation =
        await losingImplementationSelect.inputValue();

      const winningResponse = page.waitForResponse((response) =>
        response.url().includes("/api/rpc/languageAnalysis/writeSelection"),
      );
      await page.getByRole("button", { name: "Save" }).click();
      expect((await winningResponse).ok()).toBe(true);

      const losingResponse = competingPage.waitForResponse((response) =>
        response.url().includes("/api/rpc/languageAnalysis/writeSelection"),
      );
      await competingPage.getByRole("button", { name: "Save" }).click();
      expect((await losingResponse).ok()).toBe(false);

      await expect(losingLanguageInput).toHaveValue("en");
      await expect(losingImplementationSelect).toHaveValue(
        losingImplementation,
      );
    } finally {
      await competingPage.close();
    }
  });

  test("authorized observation reads do not execute analysis while Workbench reflects cached status", async ({
    page,
    editorPage,
    refs,
  }) => {
    const observations = page.waitForResponse((response) =>
      response
        .url()
        .includes("/api/rpc/languageAnalysis/getProjectObservations"),
    );
    const analysisDependencies = [
      "/api/rpc/suggestion/onNew",
      "/api/rpc/memory/onNew",
      "/api/rpc/glossary/findTerm",
    ].map((endpoint) =>
      page.waitForResponse((response) => response.url().includes(endpoint)),
    );

    await editorPage.navigateToEditor({
      projectId: refs.project,
      languageToId: "zh-Hans",
      contentNodeId: refs["content-node:elements"],
    });

    const observationResponse = await observations;
    expect(observationResponse.ok()).toBe(true);
    const sourceLanguageId = NormalizedLanguageIdSchema.parse("en");
    const initialTiming = parseObservationTiming(
      await observationResponse.json(),
      sourceLanguageId,
    );
    if (initialTiming.assessmentStatus === "UNKNOWN") {
      await expect(
        page
          .getByRole("status")
          .filter({ hasText: `语言分析 (${sourceLanguageId}):未知` }),
      ).toHaveText(`语言分析 (${sourceLanguageId}):未知`);
    } else {
      await expect(
        page
          .getByRole("status")
          .filter({ hasText: `语言分析 (${sourceLanguageId}):` }),
      ).toHaveCount(0);
    }
    const dependencyResponses = await Promise.all(analysisDependencies);
    expect(dependencyResponses.every((response) => response.ok())).toBe(true);

    // Recall routes are SSE streams. A response is usable once its initial
    // recall events reach the Workbench; waiting for transport closure would
    // incorrectly wait for a still-subscribed stream.
    const memoryPanel = page
      .getByRole("heading", { name: "翻译记忆" })
      .locator("..");
    const termPanel = page.getByRole("heading", { name: "术语" }).locator("..");
    await Promise.all([
      expect(
        memoryPanel.getByText("E2E Memory", { exact: true }),
      ).toBeVisible(),
      expect(termPanel.getByText("Hello", { exact: true })).toBeVisible(),
      expect(termPanel.getByText("World", { exact: true })).toBeVisible(),
    ]);

    const publicRecall = await page.evaluate(
      async ({ projectId }) => {
        const documentValue = Reflect.get(globalThis, "document");
        const cookie =
          typeof documentValue === "object" &&
          documentValue !== null &&
          typeof Reflect.get(documentValue, "cookie") === "string"
            ? Reflect.get(documentValue, "cookie")
            : "";
        const csrfToken = cookie
          .split("; ")
          .find((value: string) => value.startsWith("csrfToken="))
          ?.slice("csrfToken=".length);
        if (csrfToken === undefined) {
          throw new Error(
            "Authenticated Workbench did not expose a CSRF token",
          );
        }
        const response = await fetch("/api/rpc/glossary/searchTerm", {
          body: JSON.stringify({
            json: {
              projectId,
              text: "Hello World",
              termLanguageId: "en",
              translationLanguageId: "zh-Hans",
              minConfidence: 0.6,
            },
          }),
          credentials: "same-origin",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": csrfToken,
          },
          method: "POST",
        });
        return {
          body: await response.text(),
          contentType: response.headers.get("content-type"),
          ok: response.ok,
        };
      },
      { projectId: refs.project },
    );
    expect(publicRecall.ok).toBe(true);
    expect(publicRecall.contentType).toContain("text/event-stream");
    const completed = parseTermRecallStreamEvents(publicRecall.body).find(
      (event) => event.type === "COMPLETED",
    );
    if (completed === undefined) {
      throw new Error("Public term recall stream did not complete");
    }
    expect(completed.result.requestedChannels).toContain("EXACT");
    const exactOutcome = completed.result.outcomes.EXACT;
    expect(exactOutcome.status).toBe("SUCCEEDED");
    if (exactOutcome.status !== "SUCCEEDED") {
      throw new Error("Public term recall did not produce an EXACT outcome");
    }
    expect(exactOutcome.candidates).toContainEqual(
      expect.objectContaining({
        term: "Hello",
        evidences: expect.arrayContaining([
          expect.objectContaining({ channel: "exact" }),
        ]),
      }),
    );

    const directObservation = await page.evaluate(
      async ({ projectId }) => {
        const documentValue = Reflect.get(globalThis, "document");
        const cookie =
          typeof documentValue === "object" &&
          documentValue !== null &&
          typeof Reflect.get(documentValue, "cookie") === "string"
            ? Reflect.get(documentValue, "cookie")
            : "";
        const csrfToken = cookie
          .split("; ")
          .find((value: string) => value.startsWith("csrfToken="))
          ?.slice("csrfToken=".length);
        if (csrfToken === undefined) {
          throw new Error(
            "Authenticated Workbench did not expose a CSRF token",
          );
        }
        const response = await fetch(
          "/api/rpc/languageAnalysis/getProjectObservations",
          {
            body: JSON.stringify({ json: { projectId } }),
            credentials: "same-origin",
            headers: {
              "content-type": "application/json",
              "x-csrf-token": csrfToken,
            },
            method: "POST",
          },
        );
        return {
          body: (await response.json()) as unknown,
          ok: response.ok,
        };
      },
      { projectId: refs.project },
    );
    expect(directObservation.ok, {
      message: JSON.stringify(directObservation.body),
    }).toBe(true);
    expect(
      parseObservationTiming(directObservation.body, sourceLanguageId),
    ).toEqual({
      assessmentStatus: "SATISFIED",
      observationStatus: "SATISFIED",
    });
  });
});
