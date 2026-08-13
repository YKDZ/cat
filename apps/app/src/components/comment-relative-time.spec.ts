import type { IssueComment, IssueCommentThread } from "@cat/shared";
import { enableAutoUnmount, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "vue-i18n";

const mocks = vi.hoisted(() => ({
  pageContext: { user: null },
  refetch: vi.fn(),
}));

vi.mock("@pinia/colada", () => ({
  useQuery: () => ({ refetch: mocks.refetch, state: { data: [] } }),
}));

vi.mock("vike-vue/usePageContext", () => ({
  usePageContext: () => mocks.pageContext,
}));

vi.mock("#/rpc/orpc.ts", () => ({
  orpc: {
    comment: {
      deleteComment: vi.fn(),
      getChildComments: vi.fn(),
      getCommentReactions: vi.fn(),
    },
  },
}));

import Comment from "./Comment.vue";
import CommentThread from "./shared/CommentThread.vue";

enableAutoUnmount(afterEach);

const now = new Date("2026-08-02T12:00:00.000Z");
const userId = "11111111-1111-4111-8111-111111111111";

const createEnglishI18n = () =>
  createI18n({
    legacy: false,
    locale: "en_us",
    messages: {
      en_us: {
        刚刚: "just now",
        昨天: "yesterday",
      },
    },
  });

const slotStub = { template: "<div><slot /></div>" };

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("comment relative times", () => {
  it("uses the active composer in Comment", () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const wrapper = mount(Comment, {
      props: {
        comment: {
          id: 1,
          userId,
          content: "A recent comment",
          createdAt: new Date(now.getTime() - 30_000),
        },
      },
      global: {
        plugins: [createEnglishI18n()],
        stubs: {
          Badge: slotStub,
          Button: slotStub,
          CommentReact: true,
          CommentReaction: true,
          EllipsisVertical: true,
          Markdown: true,
          Popover: slotStub,
          PopoverContent: slotStub,
          PopoverTrigger: slotStub,
          Reply: true,
          Smile: true,
          TextTooltip: slotStub,
          Trash: true,
          UserAvatar: true,
        },
      },
    });

    expect(wrapper.text()).toContain("just now");
  });

  it("uses the active composer in CommentThread", () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const thread = {
      id: 1,
      externalId: "22222222-2222-4222-8222-222222222222",
      targetType: "issue",
      targetId: 1,
      isReviewThread: false,
      isResolved: false,
      reviewContext: null,
      createdAt: now,
    } satisfies IssueCommentThread;
    const comment = {
      id: 1,
      externalId: "33333333-3333-4333-8333-333333333333",
      threadId: thread.id,
      body: "A day-old comment",
      authorId: userId,
      authorAgentId: null,
      editedAt: null,
      createdAt: new Date(now.getTime() - 86_400_000),
    } satisfies IssueComment;
    const wrapper = mount(CommentThread, {
      props: { comments: [comment], thread },
      global: {
        plugins: [createEnglishI18n()],
        stubs: {
          Button: slotStub,
          DropdownMenu: slotStub,
          DropdownMenuContent: slotStub,
          DropdownMenuItem: slotStub,
          DropdownMenuTrigger: slotStub,
          EllipsisVertical: true,
          InlineEdit: true,
          Pencil: true,
          Trash: true,
          UserAvatar: true,
        },
      },
    });

    expect(wrapper.text()).toContain("yesterday");
  });
});
