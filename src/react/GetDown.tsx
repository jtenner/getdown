import { memo, useRef, type ReactElement, type ReactNode } from "react";
import type { InlineNode, MarkdownBlockNode, ParsedDocument, TableAlignment } from "../core/ast";
import { parseDocument } from "../core/document";

export interface GetDownProps {
  /** GitHub Flavored Markdown source to render. */
  content: string;
}

/**
 * Public markdown renderer.
 *
 * The parser accepts the previous document and reuses unchanged block objects.
 * Each block is rendered behind React.memo, so a growing `content` string only
 * asks React to rerender blocks whose parsed object identity changed.
 */
export function GetDown({ content }: GetDownProps): ReactElement {
  const documentRef = useRef<ParsedDocument | null>(null);
  const document = parseDocument(content, documentRef.current);
  documentRef.current = document;

  return <MarkdownDocument document={document} />;
}

function MarkdownDocument({ document }: { document: ParsedDocument }): ReactElement {
  return <>{document.blocks.map((block) => <MarkdownBlock key={block.id} block={block} />)}</>;
}

const MarkdownBlock = memo(function MarkdownBlock({ block }: { block: MarkdownBlockNode }): ReactElement {
  switch (block.kind) {
    case "paragraph":
      return <p dangerouslySetInnerHTML={{ __html: renderInlinesHtml(block.children) }} />;
    case "heading": {
      const Heading = `h${block.level}` as keyof React.JSX.IntrinsicElements;
      return <Heading dangerouslySetInnerHTML={{ __html: renderInlinesHtml(block.children) }} />;
    }
    case "thematicBreak":
      return <hr />;
    case "code":
      return (
        <pre>
          <code className={block.language ? `language-${block.language}` : undefined}>{block.text}</code>
        </pre>
      );
    case "blockquote":
      return <blockquote>{block.blocks.map((child) => <MarkdownBlock key={child.id} block={child} />)}</blockquote>;
    case "html":
      if (block.tag === "hr") return <hr />;
      return (
        <>
          <div dangerouslySetInnerHTML={{ __html: block.innerHtml }} />
          {block.trailingNewline ? "\n" : null}
        </>
      );
    case "list": {
      const List = block.ordered ? "ol" : "ul";
      return (
        <List start={block.ordered && block.startNumber !== undefined ? block.startNumber : undefined}>
          {block.items.map((item, index) => (
            <li key={index}>
              {item.task ? <input type="checkbox" disabled defaultChecked={item.task === "checked"} /> : null}
              {item.task && (item.children.length > 0 || item.blocks?.length) ? " " : null}
              {renderInlines(item.children)}
              {item.blocks?.map((child) => <MarkdownBlock key={child.id} block={child} />)}
            </li>
          ))}
        </List>
      );
    }
    case "table":
      return (
        <table>
          <thead>
            <tr>
              {block.header.map((cell, index) => (
                <th
                  key={index}
                  align={alignAttribute(block.alignments[index])}
                  dangerouslySetInnerHTML={{ __html: renderInlinesHtml(cell.children) }}
                />
              ))}
            </tr>
          </thead>
          {block.rows.length > 0 ? (
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      align={alignAttribute(block.alignments[cellIndex])}
                      dangerouslySetInnerHTML={{ __html: renderInlinesHtml(cell.children) }}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          ) : null}
        </table>
      );
  }
});

function alignAttribute(alignment: TableAlignment | undefined): "left" | "center" | "right" | undefined {
  return alignment ?? undefined;
}

function renderInlines(nodes: readonly InlineNode[]): ReactNode[] {
  return nodes.map((node, index) => renderInline(node, index));
}

function renderInlinesHtml(nodes: readonly InlineNode[]): string {
  let html = "";
  for (const node of nodes) html += renderInlineHtml(node);
  return html;
}

function renderInlineHtml(node: InlineNode): string {
  switch (node.kind) {
    case "text":
      return escapeHtml(node.value);
    case "break":
      return "<br />";
    case "emphasis":
      return `<em>${renderInlinesHtml(node.children)}</em>`;
    case "strong":
      return `<strong>${renderInlinesHtml(node.children)}</strong>`;
    case "delete":
      return `<del>${renderInlinesHtml(node.children)}</del>`;
    case "code":
      return `<code>${escapeHtml(node.value)}</code>`;
    case "link":
      return `<a href="${escapeAttribute(node.href)}"${node.title ? ` title="${escapeAttribute(node.title)}"` : ""}>${renderInlinesHtml(node.children)}</a>`;
    case "image":
      return `<img src="${escapeAttribute(node.src)}" alt="${escapeAttribute(node.alt)}"${node.title ? ` title="${escapeAttribute(node.title)}"` : ""} />`;
    case "htmlSpan":
      return `<span${node.className !== undefined ? ` class="${escapeAttribute(node.className)}"` : ""}>${renderInlinesHtml(node.children)}</span>`;
  }
}

function escapeHtml(value: string): string {
  let escaped = "";
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const replacement = char === "&" ? "&amp;" : char === "<" ? "&lt;" : char === ">" ? "&gt;" : null;
    if (!replacement) continue;
    escaped += value.slice(start, index) + replacement;
    start = index + 1;
  }
  return start === 0 ? value : escaped + value.slice(start);
}

function escapeAttribute(value: string): string {
  let escaped = "";
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const replacement = char === "&" ? "&amp;" : char === "<" ? "&lt;" : char === ">" ? "&gt;" : char === '"' ? "&quot;" : null;
    if (!replacement) continue;
    escaped += value.slice(start, index) + replacement;
    start = index + 1;
  }
  return start === 0 ? value : escaped + value.slice(start);
}

function renderInline(node: InlineNode, key: number): ReactNode {
  switch (node.kind) {
    case "text":
      return node.value;
    case "break":
      return <br key={key} />;
    case "emphasis":
      return <em key={key}>{renderInlines(node.children)}</em>;
    case "strong":
      return <strong key={key}>{renderInlines(node.children)}</strong>;
    case "delete":
      return <del key={key}>{renderInlines(node.children)}</del>;
    case "code":
      return <code key={key}>{node.value}</code>;
    case "link":
      return (
        <a key={key} href={node.href} title={node.title}>
          {renderInlines(node.children)}
        </a>
      );
    case "image":
      return <img key={key} src={node.src} alt={node.alt} title={node.title} />;
    case "htmlSpan":
      return <span key={key} className={node.className}>{renderInlines(node.children)}</span>;
  }
}
