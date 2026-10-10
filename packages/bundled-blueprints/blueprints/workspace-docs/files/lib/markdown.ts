// The Markdown export: the document's block HTML, as the editor and agents write it, rendered as
// Markdown. A Worker has no DOM parser, so the HTML is read as a flat run of tags and text.
//
// The editor formats with `execCommand` under `styleWithCSS`, so the bold, italic and
// strikethrough it applies arrive as `<span style>` rather than `<b>`, `<i>` and `<s>`; both
// spellings export alike. Formatting Markdown has no syntax for (underline, colour, size, font,
// alignment) is dropped and its text kept, as is emphasis inside code, which shows text verbatim.

/** Tags that end a run of inline content, and with it any line break still waiting for text. */
const BLOCK_TAGS: Record<string, true> = Object.fromEntries([
  "h1", "h2", "h3", "h4", "h5", "h6", "p", "div", "blockquote", "pre", "ul", "ol", "li", "hr",
  "table", "tr", "td", "th",
].map((tag) => [tag, true]));

/** Render block HTML as Markdown, ending with one newline, or as "" when it holds no content. */
export function htmlToMarkdown(html: string): string {
  const tokens = String(html).match(/<!--[\s\S]*?-->|<![^>]*>|<[^>]+>|[^<]+/g) || [];
  const lists: { type: "ul" | "ol"; count: number }[] = [];
  const links: string[] = [];
  const blockquotes: number[] = [];
  // Each open emphasis element, and whether its markers are written yet. They are written at the
  // first content inside it and closed before any trailing space, the only placement Markdown
  // reads: `**Hello **world` keeps its asterisks, and an empty `****` is a horizontal rule.
  const emphasis: { markers: string[]; open: boolean }[] = [];
  let markdown = "";
  let inPre = false;
  let inCode = false;
  let inHeading = false;
  // A `<br>` is a hard line break only when inline content follows it in the same block; the
  // editor also leaves one as the sole content of an empty paragraph.
  let pendingBreak = false;

  // Inline content is about to be written: first the line break waiting for it, then `lead` (a
  // space that stays outside any emphasis), then the emphasis waiting for content.
  const beginInline = (lead = "") => {
    markdown += (pendingBreak ? "\\\n" : "") + lead;
    pendingBreak = false;
    for (const frame of emphasis) {
      if (!frame.open) markdown += frame.markers.join("");
      frame.open = true;
    }
  };
  const endEmphasis = () => {
    const frame = emphasis.pop();
    if (!frame?.open) return;
    const close = frame.markers.toReversed().join("");
    markdown = markdown.replace(/\s*$/, (space) => close + space);
  };

  for (const token of tokens) {
    if (!token.startsWith("<")) {
      const text = decodeHtml(token);
      if (inPre) markdown += text;
      else if (inCode) markdown += text.replace(/\s+/g, " ");
      else {
        const words = text.replace(/\s+/g, " ").replace(/([\\*_[\]])/g, "\\$1");
        if (!words.trim()) markdown += words;
        else {
          beginInline(words.startsWith(" ") ? " " : "");
          markdown += words.trimStart();
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
    if (BLOCK_TAGS[tag]) pendingBreak = false;

    const markers = emphasisOf(tag, attributes);
    if (markers) {
      if (closing) endEmphasis();
      else emphasis.push({ markers, open: false });
      continue;
    }

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
        case "a": markdown += "](" + (links.pop() || "") + ")"; break;
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
      // A heading is one line in Markdown, so a break inside one becomes a space.
      case "br":
        if (inPre) markdown += "\n";
        else if (inHeading) markdown += " ";
        else pendingBreak = true;
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
      case "a": beginInline(); links.push(readHtmlAttribute(attributes, "href")); markdown += "["; break;
      case "img": {
        beginInline();
        const alt = readHtmlAttribute(attributes, "alt").replace(/[\\[\]]/g, "\\$&");
        markdown += "![" + alt + "](" + readHtmlAttribute(attributes, "src") + ")";
        break;
      }
    }
  }

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
