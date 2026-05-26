import type { QaReviewActionResult } from "@cat/shared";

import { useQuery, useQueryCache } from "@pinia/colada";
import { defineStore, storeToRefs } from "pinia";
import { navigate } from "vike/client/router";
import { computed, ref } from "vue";

import { buildQaReviewHref } from "@/pages/qa-review/scope-url";
import { orpc } from "@/rpc/orpc";
import { useEditorContextStore } from "@/stores/editor/context";
import { useEditorTableStore } from "@/stores/editor/table";

/**
 * @zh QA 审校工作台页面状态。
 * @en QA review workbench page state.
 */
export const useQaReviewWorkbenchStore = defineStore(
  "qaReviewWorkbench",
  () => {
    const contextStore = useEditorContextStore();
    const tableStore = useEditorTableStore();
    const queryCache = useQueryCache();
    const { scope } = storeToRefs(contextStore);

    const selectedElementId = ref<number | null>(null);
    const selectedQueueItemId = ref<number | null>(null);
    const selectedTranslationId = ref<number | null>(null);
    const noteBody = ref("");
    const overrideBlocking = ref(false);
    const overrideReason = ref("");
    const submitError = ref<string | null>(null);
    const isSubmitting = ref(false);

    const queueFilters = computed(() => ({
      queueStatus: [],
      riskBucket: [],
      findingAction: [],
      includeResolved: false,
    }));

    const listInput = computed(() => {
      if (!scope.value) return null;

      return {
        ...scope.value,
        page: scope.value.page - 1,
        queueFilters: queueFilters.value,
      };
    });

    const { state: elementsState, refresh: refreshElements } = useQuery({
      key: () => ["qa-review", "reviewable-elements", listInput.value],
      placeholderData: [],
      enabled: () => !import.meta.env.SSR && listInput.value !== null,
      query: async () =>
        listInput.value
          ? await orpc.qaReview.listReviewableElements(listInput.value)
          : [],
    });

    const { state: countState, refresh: refreshCount } = useQuery({
      key: () => ["qa-review", "reviewable-count", listInput.value],
      placeholderData: 0,
      enabled: () => !import.meta.env.SSR && listInput.value !== null,
      query: async () => {
        if (!listInput.value) return 0;
        const {
          page: _page,
          pageSize: _pageSize,
          ...countInput
        } = listInput.value;
        return await orpc.qaReview.countReviewableElements(countInput);
      },
    });

    const detailInput = computed(() => {
      if (!scope.value || selectedElementId.value === null) return null;

      return {
        projectId: scope.value.projectId,
        languageId: scope.value.languageToId,
        branchId: scope.value.branchId ?? null,
        elementId: selectedElementId.value,
      };
    });

    const { state: detailState, refresh: refreshDetail } = useQuery({
      key: () => ["qa-review", "reviewable-detail", detailInput.value],
      enabled: () => !import.meta.env.SSR && detailInput.value !== null,
      query: async () =>
        detailInput.value
          ? await orpc.qaReview.getReviewableElement(detailInput.value)
          : null,
    });

    const elements = computed(() => elementsState.value.data ?? []);
    const total = computed(() => countState.value.data ?? 0);
    const detail = computed(() => detailState.value.data ?? null);
    const selectedCandidate = computed(
      () =>
        detail.value?.candidates.find(
          (candidate) => candidate.queueItem.id === selectedQueueItemId.value,
        ) ?? null,
    );

    const selectElement = async (elementId: number) => {
      selectedElementId.value = elementId;
      selectedQueueItemId.value = null;
      selectedTranslationId.value = null;
      noteBody.value = "";
      overrideBlocking.value = false;
      overrideReason.value = "";

      const element = elements.value.find((row) => row.elementId === elementId);
      tableStore.setElementContextForExternalWorkbench({
        elementId,
        primaryContentNodeId: element?.primaryContentNodeId,
        sourceLanguageId: element?.sourceLanguageId,
      });

      if (scope.value) {
        await navigate(buildQaReviewHref(scope.value, elementId));
      }
    };

    const selectCandidate = (input: {
      queueItemId: number;
      translationId: number;
    }) => {
      selectedQueueItemId.value = input.queueItemId;
      selectedTranslationId.value = input.translationId;
      submitError.value = null;
    };

    const refreshAll = async () => {
      await Promise.all([refreshElements(), refreshCount(), refreshDetail()]);
    };

    const submitAction = async (
      action: "APPROVE" | "REJECT_CANDIDATE" | "DEFER",
    ): Promise<QaReviewActionResult | null> => {
      if (
        !scope.value ||
        !selectedCandidate.value ||
        selectedElementId.value === null ||
        selectedTranslationId.value === null
      ) {
        return null;
      }

      isSubmitting.value = true;
      submitError.value = null;

      try {
        const hasBlocking = selectedCandidate.value.findings.some(
          (finding) => finding.action === "BLOCK_APPROVAL",
        );
        overrideBlocking.value = action === "APPROVE" && hasBlocking;
        if (overrideBlocking.value && overrideReason.value.trim() === "") {
          overrideReason.value =
            "Reviewer explicitly approved despite blocking QA findings";
        }

        const result = await orpc.qaReview.submitAction({
          projectId: scope.value.projectId,
          languageId: scope.value.languageToId,
          branchId: scope.value.branchId ?? null,
          elementId: selectedElementId.value,
          translationId: selectedTranslationId.value,
          queueItemId: selectedCandidate.value.queueItem.id,
          action,
          expectedVersion: selectedCandidate.value.queueItem.optimisticVersion,
          noteBody: noteBody.value,
          overrideBlocking: overrideBlocking.value,
          overrideReason: overrideReason.value,
          navigation: {
            afterElementId: selectedElementId.value,
            pageSize: scope.value.pageSize,
          },
        });

        noteBody.value = "";
        overrideBlocking.value = false;
        overrideReason.value = "";

        await queryCache.invalidateQueries({
          key: ["qa-review"],
          exact: false,
        });
        await refreshAll();

        if (result.nextTarget.kind === "element") {
          await selectElement(result.nextTarget.elementId);
        } else if (scope.value) {
          selectedElementId.value = null;
          tableStore.setElementContextForExternalWorkbench({ elementId: null });
          await navigate(buildQaReviewHref(scope.value, "empty"));
        }

        return result;
      } catch (error) {
        submitError.value =
          error instanceof Error
            ? error.message
            : "qa-review-state-changed-refresh-and-retry";
        await refreshDetail();
        return null;
      } finally {
        isSubmitting.value = false;
      }
    };

    return {
      elements,
      total,
      detail,
      selectedElementId,
      selectedCandidate,
      selectedQueueItemId,
      selectedTranslationId,
      noteBody,
      overrideBlocking,
      overrideReason,
      submitError,
      isSubmitting,
      selectElement,
      selectCandidate,
      submitAction,
      refreshAll,
    };
  },
);
