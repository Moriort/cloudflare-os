// The Markdown export: the document's block HTML, as the editor and agents write it, rendered as
// Markdown. A Worker has no DOM parser, so the HTML is read as a flat run of tags and text.
//
// The editor formats with `execCommand` under `styleWithCSS`, so the bold, italic and
// strikethrough it applies arrive as `<span style>` rather than `<b>`, `<i>` and `<s>`; both
// spellings export alike. Formatting Markdown has no syntax for (underline, colour, size, font,
// alignment) is dropped and its text kept, as is emphasis inside code, which shows text verbatim.

/** Tags that end a run of inline content, closing its emphasis and dropping any space or break. */
const BLOCK_TAGS: Record<string, true> = Object.fromEntries([
  "h1", "h2", "h3", "h4", "h5", "h6", "p", "div", "blockquote", "pre", "ul", "ol", "li", "hr",
  "table", "tr", "td", "th",
].map((tag) => [tag, true]));

/** Render block HTML as Markdown, ending with one newline, or as "" when it holds no content. */
export function htmlToMarkdown(html: string): string {
  const tokens = String(html).match(/<!--[\s\S]*?-->|<![^>]*>|<[^>]+>|[^<]+/g) || [];
  const lists: { type: "ul" | "ol"; count: number }[] = [];
  const links: { href: string; depth: number }[] = [];
  const blockquotes: number[] = [];
  // The emphasis each open element asks for, and the markers open in the output. Markers follow
  // the formatting rather than the elements: they open at the first content that has it and close
  // at the next content or block that does not, before the space between, the only placement
  // Markdown reads (`**Hello **world` keeps its asterisks; an empty `****` is a horizontal rule).
  const frames: string[][] = [];
  const written: string[] = [];
  let markdown = "";
  let inPre = false;
  let inCode = false;
  let inHeading = false;
  // Space and `<br>`s since the last content, written only once more content follows: the editor
  // leaves a `<br>` as the sole content of an empty paragraph.
  let space = false;
  let breaks = 0;

  const closeTo = (depth: number) => {
    while (written.length > depth) markdown += written.pop();
  };
  // Inline content is about to be written: close the emphasis it lacks, write the space or breaks
  // before it, then open the emphasis it gains.
  const beginInline = () => {
    const wanted = [...new Set(frames.flat())];
    let kept = 0;
    while (kept < written.length && wanted.includes(written[kept])) kept++;
    closeTo(kept);
    markdown += breaks ? "\\\n".repeat(breaks) : space ? " " : "";
    space = false;
    breaks = 0;
    for (const marker of wanted) {
      if (written.includes(marker)) continue;
      written.push(marker);
      markdown += marker;
    }
  };
  const endBlock = () => {
    closeTo(0);
    space = false;
    breaks = 0;
  };

  for (const token of tokens) {
    if (!token.startsWith("<")) {
      const text = decodeHtml(token);
      if (inPre) markdown += text;
      else if (inCode) markdown += text.replace(/\s+/g, " ");
      else {
        const words = text.replace(/\s+/g, " ").replace(/([\\*_[\]])/g, "\\$1");
        space ||= words.startsWith(" ");
        if (words.trim()) {
          beginInline();
          markdown += words.trim();
          space = words.endsWith(" ");
        }
      }
      continue;
    }
    if (token.startsWith("<!--") || token.startsWith("<!")) continue;

    const match = /^<\s*(\/?)\s*([a-z0-9]+)([^>]*)>/i.exec(token);
    if (!match) continue;
    const closing = match[1] === "/";
    const tag = match[2].toLowerCase();
    const attributes = match[3];
    const markers = emphasisOf(tag, attributes);
    if (markers) {
      if (closing) frames.pop();
      else frames.push(markers);
      continue;
    }
    if (BLOCK_TAGS[tag]) endBlock();

    if (closing) {
      switch (tag) {
        case "h1": case "h2": case "h3": case "h4": case "h5": case "h6":
          inHeading = false;
          markdown += "\n\n";
          break;
        case "p": case "div":
          markdown += "\n\n";
          break;
        case "blockquote": {
          const start = blockquotes.pop();
          const content = markdown.slice(start).trim().replace(/\n{3,}/g, "\n\n");
          const quoted = content
            ? content.split("\n").map((line) => line ? "> " + line : ">").join("\n")
            : ">";
          markdown = markdown.slice(0, start) + quoted + "\n\n";
          break;
        }
        case "code": if (!inPre) { markdown += "\x60"; inCode = false; } break;
        case "pre": markdown += "\n\x60\x60\x60\n\n"; inPre = false; break;
        case "a": {
          const link = links.pop();
          closeTo(link?.depth ?? written.length);
          markdown += "](" + (link?.href ?? "") + ")";
          break;
        }
        case "li": if (!markdown.endsWith("\n")) markdown += "\n"; break;
        case "ul": case "ol": lists.pop(); break;
        case "td": case "th": markdown += "\t"; break;
        case "tr": markdown += "\n"; break;
      }
      continue;
    }

    switch (tag) {
      case "h1": case "h2": case "h3": case "h4": case "h5": case "h6":
        inHeading = true;
        markdown += "\n\n" + "#".repeat(Number(tag[1])) + " ";
        break;
      case "p": case "div": markdown += "\n\n"; break;
      // A heading is one line in Markdown, and code one span, so a break in either is a space.
      case "br":
        if (inPre) markdown += "\n";
        else if (inCode) markdown += " ";
        else if (inHeading) space = true;
        else breaks++;
        break;
      case "code": if (!inPre) { beginInline(); markdown += "\x60"; inCode = true; } break;
      case "pre": markdown += "\n\n\x60\x60\x60\n"; inPre = true; break;
      case "blockquote": markdown += "\n\n"; blockquotes.push(markdown.length); break;
      case "hr": markdown += "\n\n---\n\n"; break;
      case "ul": lists.push({ type: "ul", count: 0 }); break;
      case "ol": lists.push({ type: "ol", count: 0 }); break;
      case "li": {
        const list = lists.at(-1) || { type: "ul", count: 0 };
        list.count += 1;
        markdown += (markdown.endsWith("\n") ? "" : "\n") +
          "  ".repeat(Math.max(0, lists.length - 1)) +
          (list.type === "ol" ? list.count + ". " : "- ");
        break;
      }
      case "a":
        beginInline();
        links.push({ href: readHtmlAttribute(attributes, "href"), depth: written.length });
        markdown += "[";
        break;
      case "img": {
        beginInline();
        const alt = readHtmlAttribute(attributes, "alt").replace(/[\\[\]]/g, "\\$&");
        markdown += "![" + alt + "](" + readHtmlAttribute(attributes, "src") + ")";
        break;
      }
    }
  }
  endBlock();

  const clean = markdown
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return clean ? clean + "\n" : "";
}

/** The Markdown emphasis an inline element opens, in order, or undefined for any other element. */
function emphasisOf(tag: string, attributes: string): string[] | undefined {
  switch (tag) {
    case "strong": case "b": return ["**"];
    case "em": case "i": return ["*"];
    case "s": case "strike": case "del": return ["~~"];
    case "span": case "font": {
      const style = readHtmlAttribute(attributes, "style").toLowerCase();
      const markers: string[] = [];
      if (/font-weight\s*:\s*(bold|bolder|[6-9]00)\b/.test(style)) markers.push("**");
      if (/font-style\s*:\s*(italic|oblique)\b/.test(style)) markers.push("*");
      if (/text-decoration(-line)?\s*:[^;]*line-through/.test(style)) markers.push("~~");
      return markers;
    }
  }
}

function readHtmlAttribute(source: string, name: string): string {
  const pattern = new RegExp(name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i");
  const match = pattern.exec(source);
  return decodeHtml(match ? match[1] ?? match[2] ?? match[3] ?? "" : "");
}

function decodeHtml(value: string): string {
  return String(value).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_: string, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower.startsWith("#x")) return String.fromCodePoint(Number.parseInt(lower.slice(2), 16));
    if (lower.startsWith("#")) return String.fromCodePoint(Number.parseInt(lower.slice(1), 10));
    const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };
    return named[lower];
  });
}
