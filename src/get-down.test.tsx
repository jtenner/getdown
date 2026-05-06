import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { GetDown } from "./index";

interface GfmRenderingCase {
  section: string;
  name: string;
  markdown: string;
  html: string;
}

function render(markdown: string): string {
  return renderToStaticMarkup(<GetDown content={markdown} />);
}

export const gfmRenderingCases: GfmRenderingCase[] = [
  {
    section: "paragraphs",
    name: "single paragraph",
    markdown: "Hello, world!",
    html: "<p>Hello, world!</p>",
  },
  {
    section: "paragraphs",
    name: "two paragraphs",
    markdown: "Alpha\n\nBeta",
    html: "<p>Alpha</p><p>Beta</p>",
  },
  {
    section: "paragraphs",
    name: "soft line break",
    markdown: "Alpha\nBeta",
    html: "<p>Alpha\nBeta</p>",
  },
  {
    section: "paragraphs",
    name: "hard break with backslash",
    markdown: "Alpha\\\nBeta",
    html: "<p>Alpha<br />\nBeta</p>",
  },
  {
    section: "paragraphs",
    name: "hard break with two spaces",
    markdown: "Alpha  \nBeta",
    html: "<p>Alpha<br />\nBeta</p>",
  },
  {
    section: "paragraphs",
    name: "leading and trailing blank lines",
    markdown: "\n\nAlpha\n\n",
    html: "<p>Alpha</p>",
  },
  {
    section: "escaping",
    name: "html special characters are escaped in text",
    markdown: "1 < 2 && 3 > 2",
    html: "<p>1 &lt; 2 &amp;&amp; 3 &gt; 2</p>",
  },
  {
    section: "escaping",
    name: "backslash escapes punctuation",
    markdown: "\\*not emphasis\\* and \\# not a heading",
    html: "<p>*not emphasis* and # not a heading</p>",
  },
  {
    section: "escaping",
    name: "backslash before non escapable character remains",
    markdown: "\\a",
    html: "<p>\\a</p>",
  },
  {
    section: "escaping",
    name: "entity references",
    markdown: "&copy; &amp; &#35; &#x1F600;",
    html: "<p>© &amp; # 😀</p>",
  },
  {
    section: "headings",
    name: "atx heading level one",
    markdown: "# Heading",
    html: "<h1>Heading</h1>",
  },
  {
    section: "headings",
    name: "atx heading level six",
    markdown: "###### Heading",
    html: "<h6>Heading</h6>",
  },
  {
    section: "headings",
    name: "closing hashes are stripped",
    markdown: "### Heading ###",
    html: "<h3>Heading</h3>",
  },
  {
    section: "headings",
    name: "more than six hashes is paragraph",
    markdown: "####### Heading",
    html: "<p>####### Heading</p>",
  },
  {
    section: "headings",
    name: "escaped heading marker is paragraph",
    markdown: "\\# Heading",
    html: "<p># Heading</p>",
  },
  {
    section: "headings",
    name: "setext heading level one",
    markdown: "Heading\n=======",
    html: "<h1>Heading</h1>",
  },
  {
    section: "headings",
    name: "setext heading level two",
    markdown: "Heading\n-------",
    html: "<h2>Heading</h2>",
  },
  {
    section: "headings",
    name: "heading contains inline emphasis",
    markdown: "## Hello *world* and **friends**",
    html: "<h2>Hello <em>world</em> and <strong>friends</strong></h2>",
  },
  {
    section: "thematic breaks",
    name: "asterisk thematic break",
    markdown: "***",
    html: "<hr />",
  },
  {
    section: "thematic breaks",
    name: "dash thematic break with spaces",
    markdown: "- - -",
    html: "<hr />",
  },
  {
    section: "thematic breaks",
    name: "underscore thematic break",
    markdown: "___",
    html: "<hr />",
  },
  {
    section: "emphasis",
    name: "asterisk emphasis",
    markdown: "This is *important*.",
    html: "<p>This is <em>important</em>.</p>",
  },
  {
    section: "emphasis",
    name: "underscore emphasis",
    markdown: "This is _important_.",
    html: "<p>This is <em>important</em>.</p>",
  },
  {
    section: "emphasis",
    name: "strong emphasis with asterisks",
    markdown: "This is **important**.",
    html: "<p>This is <strong>important</strong>.</p>",
  },
  {
    section: "emphasis",
    name: "strong emphasis with underscores",
    markdown: "This is __important__.",
    html: "<p>This is <strong>important</strong>.</p>",
  },
  {
    section: "emphasis",
    name: "nested emphasis inside strong",
    markdown: "**strong and *emphasized***",
    html: "<p><strong>strong and <em>emphasized</em></strong></p>",
  },
  {
    section: "emphasis",
    name: "strong inside emphasis",
    markdown: "*emphasized and **strong***",
    html: "<p><em>emphasized and <strong>strong</strong></em></p>",
  },
  {
    section: "emphasis",
    name: "intraword underscore does not emphasize",
    markdown: "foo_bar_baz",
    html: "<p>foo_bar_baz</p>",
  },
  {
    section: "emphasis",
    name: "intraword asterisk can emphasize",
    markdown: "foo*bar*baz",
    html: "<p>foo<em>bar</em>baz</p>",
  },
  {
    section: "strikethrough",
    name: "simple strikethrough",
    markdown: "This is ~~deleted~~ text.",
    html: "<p>This is <del>deleted</del> text.</p>",
  },
  {
    section: "strikethrough",
    name: "strikethrough can contain emphasis",
    markdown: "~~deleted *with emphasis*~~",
    html: "<p><del>deleted <em>with emphasis</em></del></p>",
  },
  {
    section: "strikethrough",
    name: "single tilde is literal",
    markdown: "~not deleted~",
    html: "<p>~not deleted~</p>",
  },
  {
    section: "code spans",
    name: "simple code span",
    markdown: "Use `const x = 1` here.",
    html: "<p>Use <code>const x = 1</code> here.</p>",
  },
  {
    section: "code spans",
    name: "code span escapes html",
    markdown: "`<script>alert(1)</script>`",
    html: "<p><code>&lt;script&gt;alert(1)&lt;/script&gt;</code></p>",
  },
  {
    section: "code spans",
    name: "double backticks allow single backtick",
    markdown: "``Use `code` here``",
    html: "<p><code>Use `code` here</code></p>",
  },
  {
    section: "code spans",
    name: "code span normalizes internal newlines to spaces",
    markdown: "`alpha\nbeta`",
    html: "<p><code>alpha beta</code></p>",
  },
  {
    section: "links",
    name: "inline link",
    markdown: "[GitHub](https://github.com)",
    html: "<p><a href=\"https://github.com\">GitHub</a></p>",
  },
  {
    section: "links",
    name: "inline link with title",
    markdown: "[GitHub](https://github.com \"GitHub home\")",
    html: "<p><a href=\"https://github.com\" title=\"GitHub home\">GitHub</a></p>",
  },
  {
    section: "links",
    name: "link text contains emphasis",
    markdown: "[*GitHub*](https://github.com)",
    html: "<p><a href=\"https://github.com\"><em>GitHub</em></a></p>",
  },
  {
    section: "links",
    name: "reference link full",
    markdown: "[GitHub][gh]\n\n[gh]: https://github.com \"GitHub home\"",
    html: "<p><a href=\"https://github.com\" title=\"GitHub home\">GitHub</a></p>",
  },
  {
    section: "links",
    name: "reference link collapsed",
    markdown: "[GitHub][]\n\n[GitHub]: https://github.com",
    html: "<p><a href=\"https://github.com\">GitHub</a></p>",
  },
  {
    section: "links",
    name: "reference link shortcut",
    markdown: "[GitHub]\n\n[GitHub]: https://github.com",
    html: "<p><a href=\"https://github.com\">GitHub</a></p>",
  },
  {
    section: "links",
    name: "missing reference remains literal",
    markdown: "[GitHub][missing]",
    html: "<p>[GitHub][missing]</p>",
  },
  {
    section: "images",
    name: "inline image",
    markdown: "![Alt text](https://example.com/image.png)",
    html: "<p><img src=\"https://example.com/image.png\" alt=\"Alt text\" /></p>",
  },
  {
    section: "images",
    name: "inline image with title",
    markdown: "![Alt text](https://example.com/image.png \"Image title\")",
    html: "<p><img src=\"https://example.com/image.png\" alt=\"Alt text\" title=\"Image title\" /></p>",
  },
  {
    section: "images",
    name: "image alt text is plain text",
    markdown: "![*Alt* `code`](https://example.com/image.png)",
    html: "<p><img src=\"https://example.com/image.png\" alt=\"Alt code\" /></p>",
  },
  {
    section: "autolinks",
    name: "angle bracket autolink",
    markdown: "<https://github.com>",
    html: "<p><a href=\"https://github.com\">https://github.com</a></p>",
  },
  {
    section: "autolinks",
    name: "email autolink",
    markdown: "<user@example.com>",
    html: "<p><a href=\"mailto:user@example.com\">user@example.com</a></p>",
  },
  {
    section: "autolinks",
    name: "gfm literal url autolink",
    markdown: "Visit https://github.com now.",
    html: "<p>Visit <a href=\"https://github.com\">https://github.com</a> now.</p>",
  },
  {
    section: "autolinks",
    name: "gfm literal www autolink",
    markdown: "Visit www.github.com now.",
    html: "<p>Visit <a href=\"http://www.github.com\">www.github.com</a> now.</p>",
  },
  {
    section: "autolinks",
    name: "gfm literal email autolink",
    markdown: "Email user@example.com please.",
    html: "<p>Email <a href=\"mailto:user@example.com\">user@example.com</a> please.</p>",
  },
  {
    section: "lists",
    name: "unordered list with hyphens",
    markdown: "- one\n- two",
    html: "<ul><li>one</li><li>two</li></ul>",
  },
  {
    section: "lists",
    name: "unordered list with asterisks",
    markdown: "* one\n* two",
    html: "<ul><li>one</li><li>two</li></ul>",
  },
  {
    section: "lists",
    name: "ordered list preserves start number",
    markdown: "3. three\n4. four",
    html: "<ol start=\"3\"><li>three</li><li>four</li></ol>",
  },
  {
    section: "lists",
    name: "ordered list with right paren delimiter",
    markdown: "1) one\n2) two",
    html: "<ol><li>one</li><li>two</li></ol>",
  },
  {
    section: "lists",
    name: "nested unordered list",
    markdown: "- one\n  - nested\n  - nested two\n- two",
    html: "<ul><li>one<ul><li>nested</li><li>nested two</li></ul></li><li>two</li></ul>",
  },
  {
    section: "lists",
    name: "nested ordered list",
    markdown: "1. one\n   1. nested\n   2. nested two\n2. two",
    html: "<ol><li>one<ol><li>nested</li><li>nested two</li></ol></li><li>two</li></ol>",
  },
  {
    section: "lists",
    name: "loose unordered list",
    markdown: "- one\n\n- two",
    html: "<ul><li><p>one</p></li><li><p>two</p></li></ul>",
  },
  {
    section: "lists",
    name: "list item with paragraph continuation",
    markdown: "- one\n  continued\n- two",
    html: "<ul><li>one\ncontinued</li><li>two</li></ul>",
  },
  {
    section: "lists",
    name: "list item with block quote",
    markdown: "- item\n  > quote",
    html: "<ul><li>item<blockquote><p>quote</p></blockquote></li></ul>",
  },
  {
    section: "task lists",
    name: "unchecked task list item",
    markdown: "- [ ] todo",
    html: "<ul><li><input type=\"checkbox\" disabled=\"\" /> todo</li></ul>",
  },
  {
    section: "task lists",
    name: "checked task list item lowercase x",
    markdown: "- [x] done",
    html: "<ul><li><input type=\"checkbox\" disabled=\"\" checked=\"\" /> done</li></ul>",
  },
  {
    section: "task lists",
    name: "checked task list item uppercase x",
    markdown: "- [X] done",
    html: "<ul><li><input type=\"checkbox\" disabled=\"\" checked=\"\" /> done</li></ul>",
  },
  {
    section: "task lists",
    name: "nested task list items",
    markdown: "- [x] parent\n  - [ ] child",
    html: "<ul><li><input type=\"checkbox\" disabled=\"\" checked=\"\" /> parent<ul><li><input type=\"checkbox\" disabled=\"\" /> child</li></ul></li></ul>",
  },
  {
    section: "block quotes",
    name: "simple block quote",
    markdown: "> quoted",
    html: "<blockquote><p>quoted</p></blockquote>",
  },
  {
    section: "block quotes",
    name: "lazy continuation",
    markdown: "> quoted\ncontinued",
    html: "<blockquote><p>quoted\ncontinued</p></blockquote>",
  },
  {
    section: "block quotes",
    name: "nested block quotes",
    markdown: "> outer\n> > inner",
    html: "<blockquote><p>outer</p><blockquote><p>inner</p></blockquote></blockquote>",
  },
  {
    section: "block quotes",
    name: "block quote with list",
    markdown: "> - one\n> - two",
    html: "<blockquote><ul><li>one</li><li>two</li></ul></blockquote>",
  },
  {
    section: "code blocks",
    name: "indented code block",
    markdown: "    const x = 1;\n    console.log(x);",
    html: "<pre><code>const x = 1;\nconsole.log(x);\n</code></pre>",
  },
  {
    section: "code blocks",
    name: "fenced code block with backticks",
    markdown: "```\nconst x = 1;\n```",
    html: "<pre><code>const x = 1;\n</code></pre>",
  },
  {
    section: "code blocks",
    name: "fenced code block with tildes",
    markdown: "~~~\nconst x = 1;\n~~~",
    html: "<pre><code>const x = 1;\n</code></pre>",
  },
  {
    section: "code blocks",
    name: "fenced code block with info string",
    markdown: "```ts\nconst x: number = 1;\n```",
    html: "<pre><code class=\"language-ts\">const x: number = 1;\n</code></pre>",
  },
  {
    section: "code blocks",
    name: "fenced code block escapes html",
    markdown: "```html\n<div>safe text</div>\n```",
    html: "<pre><code class=\"language-html\">&lt;div&gt;safe text&lt;/div&gt;\n</code></pre>",
  },
  {
    section: "code blocks",
    name: "unclosed fenced code block consumes to end",
    markdown: "```\nunterminated",
    html: "<pre><code>unterminated\n</code></pre>",
  },
  {
    section: "html",
    name: "inline html is preserved",
    markdown: "Hello <span>world</span>.",
    html: "<p>Hello <span>world</span>.</p>",
  },
  {
    section: "html",
    name: "html block is preserved",
    markdown: "<div>\n  <strong>Hello</strong>\n</div>",
    html: "<div>\n  <strong>Hello</strong>\n</div>",
  },
  {
    section: "html",
    name: "markdown is not parsed inside html block",
    markdown: "<div>\n**not strong**\n</div>",
    html: "<div>\n**not strong**\n</div>",
  },
  {
    section: "tables",
    name: "simple table",
    markdown: "| A | B |\n| - | - |\n| 1 | 2 |",
    html: "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>",
  },
  {
    section: "tables",
    name: "table alignments",
    markdown: "| Left | Center | Right |\n| :--- | :----: | ----: |\n| a | b | c |",
    html: "<table><thead><tr><th align=\"left\">Left</th><th align=\"center\">Center</th><th align=\"right\">Right</th></tr></thead><tbody><tr><td align=\"left\">a</td><td align=\"center\">b</td><td align=\"right\">c</td></tr></tbody></table>",
  },
  {
    section: "tables",
    name: "table without leading and trailing pipes",
    markdown: "A | B\n- | -\n1 | 2",
    html: "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>",
  },
  {
    section: "tables",
    name: "table cell inline markdown",
    markdown: "| A | B |\n| - | - |\n| **strong** | `code` |",
    html: "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td><strong>strong</strong></td><td><code>code</code></td></tr></tbody></table>",
  },
  {
    section: "tables",
    name: "escaped pipe in table cell",
    markdown: "| A | B |\n| - | - |\n| a \\| b | c |",
    html: "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>a | b</td><td>c</td></tr></tbody></table>",
  },
  {
    section: "tables",
    name: "extra table cells are ignored",
    markdown: "| A | B |\n| - | - |\n| 1 | 2 | 3 |",
    html: "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>",
  },
  {
    section: "tables",
    name: "missing table cells are empty",
    markdown: "| A | B |\n| - | - |\n| 1 |",
    html: "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td></td></tr></tbody></table>",
  },
  {
    section: "definitions",
    name: "link definition is not rendered",
    markdown: "[id]: https://example.com",
    html: "",
  },
  {
    section: "definitions",
    name: "link definition can be indented up to three spaces",
    markdown: "   [id]: https://example.com\n\n[id]",
    html: "<p><a href=\"https://example.com\">id</a></p>",
  },
  {
    section: "definitions",
    name: "four-space indented link definition is code",
    markdown: "    [id]: https://example.com",
    html: "<pre><code>[id]: https://example.com\n</code></pre>",
  },
  {
    section: "complex documents",
    name: "mixed document with heading quote list and table",
    markdown: "# Title\n\n> Intro with **strong** text.\n\n- [x] done\n- [ ] todo\n\n| Name | Value |\n| --- | ---: |\n| A | 1 |\n| B | 2 |",
    html: "<h1>Title</h1><blockquote><p>Intro with <strong>strong</strong> text.</p></blockquote><ul><li><input type=\"checkbox\" disabled=\"\" checked=\"\" /> done</li><li><input type=\"checkbox\" disabled=\"\" /> todo</li></ul><table><thead><tr><th>Name</th><th align=\"right\">Value</th></tr></thead><tbody><tr><td>A</td><td align=\"right\">1</td></tr><tr><td>B</td><td align=\"right\">2</td></tr></tbody></table>",
  },
  {
    section: "complex documents",
    name: "inline precedence code beats emphasis and links",
    markdown: "`**not strong** [not a link](https://example.com)` and **strong**",
    html: "<p><code>**not strong** [not a link](https://example.com)</code> and <strong>strong</strong></p>",
  },
  {
    section: "complex documents",
    name: "link destination containing escaped parenthesis",
    markdown: "[link](https://example.com/foo\\)bar)",
    html: "<p><a href=\"https://example.com/foo)bar\">link</a></p>",
  },
  {
    section: "complex documents",
    name: "image inside link",
    markdown: "[![alt](image.png)](https://example.com)",
    html: "<p><a href=\"https://example.com\"><img src=\"image.png\" alt=\"alt\" /></a></p>",
  },
  {
    section: "complex documents",
    name: "unicode text and emoji",
    markdown: "Привет **мир** 😀",
    html: "<p>Привет <strong>мир</strong> 😀</p>",
  },
  {
    section: "complex documents",
    name: "carriage returns normalize to line feeds",
    markdown: "# Title\r\n\r\nText",
    html: "<h1>Title</h1><p>Text</p>",
  },
  {
    section: "complex documents",
    name: "null character replacement",
    markdown: "a\u0000b",
    html: "<p>a�b</p>",
  },
];

describe("GetDown GFM rendering", () => {
  for (const renderingCase of gfmRenderingCases) {
    test(`${renderingCase.section}: ${renderingCase.name}`, () => {
      expect(render(renderingCase.markdown)).toBe(renderingCase.html);
    });
  }
});
