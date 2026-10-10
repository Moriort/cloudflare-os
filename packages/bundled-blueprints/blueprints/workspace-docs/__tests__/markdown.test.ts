// @vitest-environment node
import { describe, expect, it } from "vitest";
import { htmlToMarkdown } from "../files/lib/markdown.ts";

describe("htmlToMarkdown", () => {
  // The markup Chrome's execCommand writes under styleWithCSS for the toolbar's Bold, Italic,
  // Strikethrough, Underline and font size.
  it("exports the emphasis the toolbar applies as inline styles", () => {
    expect(htmlToMarkdown(
      '<p data-block-id="b1"><span style="font-weight: bold;">Hello</span> ' +
      '<span style="font-style: italic;">world</span>, ' +
      '<span style="text-decoration-line: line-through;">select</span> ' +
      '<span style="text-decoration-line: underline;">me</span> ' +
      '<font style="font-size: 18pt;">big</font> ' +
      '<span style="font-weight: 700; font-style: italic;">both</span>.</p>',
    )).toBe("**Hello** *world*, ~~select~~ me big ***both***.\n");
  });

  it("keeps a line break, but not the one holding an empty paragraph open", () => {
    expect(htmlToMarkdown(
      "<p>line one<br>line <b>two</b><br></p><p><br></p><h2>a<br>b</h2><pre>x<br>y</pre>",
    )).toBe("line one\\\nline **two**\n\n## a b\n\n```\nx\ny\n```\n");
  });
});
