// The Google Doc session against the real Docs API, which the workerd suite only models: what a
// document Google built reads as, what each kind of edit leaves behind, and what each operation
// costs in provider requests. Run with `pnpm --filter @gadgets/google-gatekeeper test:live`; see
// vitest.docs-live.config.ts for the token it needs.
import { env } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GoogleDocsApi, type GoogleDocsTab } from "../../src/docs-api";
import { docTabToMarkdown } from "../../src/markdown-converter";

const TOKEN = env.GOOGLE_DOCS_LIVE_TOKEN;
const DOCS = "https://docs.googleapis.com/v1/documents";
const realFetch = globalThis.fetch;

/** The live document the session's fixed `doc-1` stands for in the current test. */
let documentId = "";
const created: string[] = [];
/** The session's provider requests since the last `counted()`. */
let requests: string[] = [];

/** Send the session's requests for `doc-1` to the live document, as the token's account. */
async function route(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  let request = new Request(input, init);
  let url = new URL(request.url);
  let session = url.pathname.includes("/doc-1");
  url.pathname = url.pathname
    .replace("/documents/doc-1", `/documents/${documentId}`)
    .replace("/files/doc-1", `/files/${documentId}`);
  if (session) {
    let fields = url.searchParams.get("fields");
    requests.push(url.hostname === "www.googleapis.com" ? "drive"
      : url.pathname.endsWith(":batchUpdate") ? "batchUpdate"
      : fields ? `get(${fields})` : "get");
  }
  let forwarded = new Request(url.toString(), request);
  forwarded.headers.set("Authorization", `Bearer ${TOKEN}`);
  let response = await realFetch(forwarded);
  if (!session || !response.headers.get("Content-Type")?.includes("json")) return response;
  // The session checks that Google answered for the document it asked about. Only the top-level
  // ID is renamed: the document's own text and links must reach the session as Google sent them.
  let body = await response.json<Record<string, unknown>>();
  if (body.documentId === documentId) body.documentId = "doc-1";
  if (body.id === documentId) body.id = "doc-1";
  return Response.json(body, { status: response.status });
}

async function google(url: string, init: RequestInit = {}): Promise<any> {
  let response = await realFetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
  });
  let text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

function batchUpdate(body: unknown[]): Promise<unknown> {
  return google(`${DOCS}/${documentId}:batchUpdate`, {
    method: "POST", body: JSON.stringify({ requests: body }),
  });
}

/** A paragraph to build: its text, named style, styled words, and list preset. */
type Para = {
  text: string;
  style?: string;
  words?: { word: string; textStyle: object; fields: string }[];
  bullet?: string;
};

/** Create a document holding `paras`, making it the one `doc-1` stands for. */
async function createDocument(title: string, paras: Para[]): Promise<void> {
  ({ documentId } = await google(DOCS, { method: "POST", body: JSON.stringify({ title }) }));
  created.push(documentId);
  let body: unknown[] = [{
    insertText: { location: { index: 1 }, text: paras.map(para => para.text).join("\n") },
  }];
  let bullets: { startIndex: number; endIndex: number; bulletPreset: string }[] = [];
  let index = 1;
  for (let { text, style = "NORMAL_TEXT", words = [], bullet } of paras) {
    let range = { startIndex: index, endIndex: index + text.length + 1 };
    body.push({
      updateParagraphStyle: { range, paragraphStyle: { namedStyleType: style }, fields: "namedStyleType" },
    });
    for (let { word, textStyle, fields } of words) {
      let startIndex = index + text.indexOf(word);
      body.push({
        updateTextStyle: { range: { startIndex, endIndex: startIndex + word.length }, textStyle, fields },
      });
    }
    let previous = bullets.at(-1);
    if (bullet && previous?.endIndex === range.startIndex && previous.bulletPreset === bullet) {
      previous.endIndex = range.endIndex;
    } else if (bullet) {
      bullets.push({ ...range, bulletPreset: bullet });
    }
    index = range.endIndex;
  }
  // Leading tabs set nesting and are removed, so the later ranges go first.
  for (let { bulletPreset, ...range } of bullets.toReversed()) {
    body.push({ createParagraphBullets: { range, bulletPreset } });
  }
  await batchUpdate(body);
}

/** The document's first tab as Google holds it now, read past the session. */
async function liveTab(): Promise<GoogleDocsTab> {
  vi.stubGlobal("fetch", realFetch);
  try {
    return (await new GoogleDocsApi(async () => TOKEN).getDocument(documentId)).tabs[0];
  } finally {
    vi.stubGlobal("fetch", route);
  }
}

function hooks() {
  return env.TEST_HOOKS.getByName("live");
}

/** The provider requests `body` makes. */
async function counted(body: () => Promise<unknown>): Promise<string[]> {
  requests = [];
  await body();
  return requests;
}

async function replace(facet: string, oldMarkdown: string, newMarkdown: string): Promise<void> {
  let actionId = await hooks().submitReplace(facet, oldMarkdown, newMarkdown);
  expect(await hooks().applyAction(facet, actionId)).toBeNull();
}

const NUMBERED = "NUMBERED_DECIMAL_ALPHA_ROMAN";
const BULLETED = "BULLET_DISC_CIRCLE_SQUARE";
const CHECKBOX = "BULLET_CHECKBOX";

describe.skipIf(!TOKEN)("Google Doc session against the live API", () => {
  beforeAll(() => {
    vi.stubGlobal("fetch", route);
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await Promise.all(created.map(id => realFetch(`https://www.googleapis.com/drive/v3/files/${id}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${TOKEN}` },
    })));
  });

  it("reads what Google builds", async () => {
    await createDocument("live: read", [
      { text: "Doc Title", style: "TITLE" },
      { text: "A subtitle", style: "SUBTITLE" },
      { text: "Heading One", style: "HEADING_1" },
      { text: "Plain bold italic both underline strike link red end.", words: [
        { word: "bold", textStyle: { bold: true }, fields: "bold" },
        { word: "italic", textStyle: { italic: true }, fields: "italic" },
        { word: "both", textStyle: { bold: true, italic: true }, fields: "bold,italic" },
        { word: "underline", textStyle: { underline: true }, fields: "underline" },
        { word: "strike", textStyle: { strikethrough: true }, fields: "strikethrough" },
        { word: "link", textStyle: { link: { url: "https://example.com/a?b=c" } }, fields: "link" },
        { word: "red", textStyle: { foregroundColor: { color: { rgbColor: { red: 1 } } } }, fields: "foregroundColor" },
      ] },
      { text: "Bullet one", bullet: BULLETED },
      { text: "\tNested bullet", bullet: BULLETED },
      { text: "Between lists" },
      { text: "Step one", bullet: NUMBERED },
      { text: "Step two", bullet: NUMBERED },
      { text: "Task item", bullet: CHECKBOX },
      { text: "Heading Six", style: "HEADING_6" },
      { text: "Specials *star* _under_ [br] `tick` <tag>" },
      { text: "Last" },
    ]);
    await batchUpdate([{ insertTable: { rows: 1, columns: 2, endOfSegmentLocation: {} } }]);
    await batchUpdate([{ insertPageBreak: { endOfSegmentLocation: {} } }]);

    expect(await hooks().readContent("read")).toBe([
      "# Doc Title",
      "*A subtitle*",
      "# Heading One",
      "Plain **bold** *italic* ***both*** underline ~~strike~~ [link](https://example.com/a?b=c) red end.",
      "- Bullet one\n  - Nested bullet",
      "Between lists",
      "1. Step one\n1. Step two",
      "- Task item",
      "###### Heading Six",
      "Specials *star* _under_ [br] `tick` <tag>",
      "Last",
      "<table>\n  <tr>\n    <td><p></p></td>\n    <td><p></p></td>\n  </tr>\n</table>",
      // The page break's paragraph, then the empty one Google keeps at the end of the body.
      "\\[Page break\\]\n\n\n",
    ].join("\n\n"));
  });

  it("applies each kind of edit as written", async () => {
    let cases: { name: string; paras: Para[]; edits: [string, string][]; after: string }[] = [
      { name: "emoji", paras: [{ text: "Hi 👋 there. Target." }],
        edits: [["Target.", "Done 🎉."], ["there", "everyone"]], after: "Hi 👋 everyone. Done 🎉.\n" },
      { name: "emoji-swap", paras: [{ text: "Smile 😀 now" }],
        edits: [["😀", "😁"]], after: "Smile 😁 now\n" },
      // A line break inside a paragraph (Shift+Enter) is U+000B, in what is read and written alike.
      { name: "line-break", paras: [{ text: "Line one\u000bline two" }, { text: "Target" }],
        edits: [["line two", "line 2"], ["Target", "A\u000bB"]], after: "Line one\u000bline 2\n\nA\u000bB\n" },
      { name: "heading", paras: [{ text: "Heading", style: "HEADING_1" }, { text: "Body" }],
        edits: [["# Heading", "Heading"]], after: "Heading\n\nBody\n" },
      { name: "to-list", paras: [{ text: "Alpha" }, { text: "Beta" }],
        edits: [["Alpha\n\nBeta", "- Alpha\n- Beta"]], after: "- Alpha\n- Beta\n" },
      { name: "numbered", paras: [{ text: "A", bullet: NUMBERED }, { text: "B", bullet: NUMBERED }],
        edits: [["1. A\n1. B", "1. A\n2. X\n3. B"]], after: "1. A\n1. X\n1. B\n" },
      { name: "nested", paras: [{ text: "Top", bullet: BULLETED }, { text: "\tChild", bullet: BULLETED }],
        edits: [["  - Child", "  - Child two\n  - Child three"]],
        after: "- Top\n  - Child two\n  - Child three\n" },
      { name: "delete", paras: [{ text: "Alpha" }, { text: "Beta" }, { text: "Gamma" }],
        edits: [["Alpha\n\nBeta\n\nGamma", "Alpha\n\nGamma"]], after: "Alpha\n\nGamma\n" },
      { name: "link", paras: [{ text: "see link here", words: [
        { word: "link", textStyle: { link: { url: "https://a.example/" } }, fields: "link" }] }],
        edits: [["(https://a.example/)", "(https://b.example/)"]], after: "see [link](https://b.example/) here\n" },
      { name: "literal", paras: [{ text: "Specials *star* stay" }, { text: "Target" }],
        edits: [["Specials *star*", "Specials *star* more"], ["Target", "Changed **bold**"]],
        after: "Specials *star* more stay\n\nChanged **bold**\n" },
      { name: "append", paras: [{ text: "Start" }],
        edits: [["Start", "Start\n\n## Added\n\n- one\n- two\n\nPrice is 5 * 3 and a_b_c, see [x](https://example.com)."]],
        after: "Start\n\n## Added\n\n- one\n- two\n\nPrice is 5 * 3 and a_b_c, see [x](https://example.com).\n" },
    ];
    for (let { name, paras, edits, after } of cases) {
      await createDocument(`live: ${name}`, paras);
      for (let [oldMarkdown, newMarkdown] of edits) await replace(name, oldMarkdown, newMarkdown);
      expect(docTabToMarkdown(await liveTab()).markdown, name).toBe(after);
    }
  });

  it("keeps the styles and list kinds Markdown cannot show", async () => {
    await createDocument("live: hidden styles", [
      { text: "Plain underline red important end.", words: [
        { word: "underline", textStyle: { underline: true }, fields: "underline" },
        { word: "red", textStyle: { foregroundColor: { color: { rgbColor: { red: 1 } } } }, fields: "foregroundColor" },
        { word: "important", textStyle: { bold: true }, fields: "bold" },
      ] },
      { text: "Task item", bullet: CHECKBOX },
    ]);
    await replace("hidden", "Plain", "Simple");
    await replace("hidden", "important", "critical");
    await replace("hidden", "- Task item", "- Task done");

    let tab = await liveTab();
    let runs = tab.body.content.flatMap(element => element.paragraph?.elements ?? [])
      .flatMap(element => element.textRun ? [element.textRun] : []);
    let styleOf = (text: string) => runs.find(run => run.content === text)?.textStyle;
    expect(styleOf("underline")).toEqual({ underline: true });
    expect(styleOf("red")).toEqual({ foregroundColor: { color: { rgbColor: { red: 1 } } } });
    expect(styleOf("critical")).toEqual({ bold: true });
    let task = tab.body.content.find(element => element.paragraph?.bullet)!.paragraph!;
    let level = tab.lists[task.bullet!.listId].listProperties.nestingLevels[0];
    expect(level.glyphType).toBe("GLYPH_TYPE_UNSPECIFIED");
    expect(docTabToMarkdown(tab).markdown).toBe("Simple underline red **critical** end.\n\n- Task done\n");
  });

  it("costs the requests it needs", async () => {
    await createDocument("live: costs", [{ text: "First" }]);
    expect(await counted(() => hooks().readContent("costs"))).toEqual(["get"]);
    expect(await counted(() => hooks().readContent("costs"))).toEqual([]);
    let actionId = 0;
    expect(await counted(async () => {
      actionId = await hooks().submitReplace("costs", "First", "Second");
    })).toEqual([]);
    // Read the revision, write the edit with its marker, then drop the marker.
    expect(await counted(() => hooks().applyAction("costs", actionId)))
      .toEqual(["get", "batchUpdate", "batchUpdate"]);
    expect(await counted(() => hooks().readContent("costs"))).toEqual(["get"]);
    expect(await hooks().readContent("costs")).toBe("Second\n");
    expect(await counted(() => hooks().readMetadata("costs")))
      .toEqual(["get(documentId,title,revisionId)"]);
  });
});
