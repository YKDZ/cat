import { describe, expect, it } from "vitest";
import { h } from "vue";
import { renderToString } from "vue/server-renderer";

import Markdown from "./Markdown.vue";

describe("Markdown", () => {
  it("renders markdown safely during SSR", async () => {
    const html = await renderToString(
      h(Markdown, { content: "**hello** <script>alert('xss')</script>" }),
    );

    expect(html).toContain("<strong>hello</strong>");
    expect(html).not.toContain("<script>");
  });
});
