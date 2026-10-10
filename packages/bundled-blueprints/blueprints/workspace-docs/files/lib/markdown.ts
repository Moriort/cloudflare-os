// The Markdown export: the document's block HTML, as the editor and agents write it, rendered as
// Markdown. A Worker has no DOM parser, so the HTML is read as a flat run of tags and text.
//
// The editor formats with `execCommand` under `styleWithCSS`, so the bold, italic and
// strikethrough it applies arrive as `<span style>` rather than `<b>`, `<i>` and `<s>`; both
// spellings export alike. Formatting Markdown has no syntax for (underline, colour, size, font,
// alignment) is dropped and its text kept.

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
  // The emphasis each open `<span>`/`<font>` began, so its closing tag can end it.
  const styled: string[][] = [];
  let markdown = "";
  let inPre = false;
  let inHeading = false;
  // A `<br>` is a hard line break only when inline content follows it in the same block; the
  // editor also leaves one as the sole content of an empty paragraph.
  let pendingBreak = false;
  const flushBreak = () => {
    if (pendingBreak) markdown += "\\\n";
    pendingBreak = false;
  };

  for (const token of tokens) {
    if (!token.startsWith("<")) {
      let text = decodeHtml(token);
      if (!inPre) {
        text = text.replace(/\s+/g, " ").replace(/([\\*_[\]])/g, "\\$1");
        if (text.trim()) flushBreak();
      }
      markdown += text;
      continue;
    }
    if (token.startsWith("<!--") || token.startsWith("<!")) continue;

    const match = /^<\s*(\/?)\s*([a-z0-9]+)([^>]*)>/i.exec(token);
    if (!match) continue;
    const closing = match[1] === "/";
    const tag = match[2].toLowerCase();
    const attributes = match[3];
    if (BLOCK_TAGS[tag]) pendingBreak = false;
    else if (!closing && tag !== "br") flushBreak();

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
        case "strong": case "b": markdown += "**"; break;
        case "em": case "i": markdown += "*"; break;
        case "s": case "strike": case "del": markdown += "~~"; break;
        case "span": case "font": markdown += (styled.pop() ?? []).toReversed().join(""); break;
        case "code": if (!inPre) markdown += "\x60"; break;
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
      case "strong": case "b": markdown += "**"; break;
      case "em": case "i": markdown += "*"; break;
      case "s": case "strike": case "del": markdown += "~~"; break;
      case "span": case "font": {
        const markers = styleMarkers(readHtmlAttribute(attributes, "style"));
        styled.push(markers);
        markdown += markers.join("");
        break;
      }
      case "code": if (!inPre) markdown += "\x60"; break;
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
      case "a": links.push(readHtmlAttribute(attributes, "href")); markdown += "["; break;
      case "img": {
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

/** The Markdown emphasis an inline `style` declares, in the order it opens. */
function styleMarkers(style: string): string[] {
  const declarations = style.toLowerCase();
  const markers: string[] = [];
  if (/font-weight\s*:\s*(bold|bolder|[6-9]00)\b/.test(declarations)) markers.push("**");
  if (/font-style\s*:\s*(italic|oblique)\b/.test(declarations)) markers.push("*");
  if (/text-decoration(-line)?\s*:[^;]*line-through/.test(declarations)) markers.push("~~");
  return markers;
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
