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

  // Plain-text paste writes each newline as a `<br>`, so a blank line between pasted paragraphs
  // is two in a row.
  it("keeps each line break, but not those holding the end of a paragraph open", () => {
    expect(htmlToMarkdown(
      "<p>line one<br>line <b>two</b><br></p><p>pasted<br><br>after a blank line<br><br></p>" +
      "<p><br></p><h2>a<br>b</h2><pre>x<br>y</pre>",
    )).toBe(
      "line one\\\nline **two**\n\npasted\\\n\\\nafter a blank line\n\n## a b\n\n```\nx\ny\n```\n",
    );
  });

  // Typing "Hello " in bold leaves the space inside the run, and `**Hello **world` keeps its
  // asterisks; Enter after a bold line leaves an empty bold run, and `****` is a horizontal rule.
  it("writes emphasis only around text, tight against it", () => {
    expect(htmlToMarkdown(
      '<p><span style="font-weight: bold;">Hello </span>world,<i> see</i> ' +
      '<b><a href="https://example.com">this</a></b></p>' +
      '<p><span style="font-weight: bold;"><br></span></p>' +
      '<p><span style="text-decoration-line: line-through;"><br></span></p>',
    )).toBe("**Hello** world, *see* **[this](https://example.com)**\n");
  });

  // Bolding again what is already bold, or next to it, gives two elements for one stretch of
  // bold; a pair of markers each would read `**A****B**`, with the asterisks showing.
  it("writes one pair of markers for each stretch of formatting", () => {
    expect(htmlToMarkdown(
      '<p><b>A<span style="font-weight: bold;">B</span>C</b> and <b>pasted</b>' +
      '<span style="font-weight: bold;">rebold</span>, <i><b>both</b> italic</i></p>',
    )).toBe("**ABC** and **pastedrebold**, ***both** italic*\n");
  });

  it("keeps code verbatim, without emphasis or escapes", () => {
    expect(htmlToMarkdown(
      '<pre><span style="font-weight: bold;">npm</span> install</pre>' +
      "<p>Run <code>a*b_c</code> or <b><code>x</code></b>, <code>one<br>line</code></p>",
    )).toBe("```\nnpm install\n```\n\nRun `a*b_c` or **`x`**, `one line`\n");
  });
});
