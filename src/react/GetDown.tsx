import { memo, useRef, type ReactElement, type ReactNode } from "react";
import type { InlineNode, MarkdownBlockNode, ParsedDocument } from "../core/ast";
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
      return <p>{renderInlines(block.children)}</p>;
    case "heading": {
      const Heading = `h${block.level}` as keyof React.JSX.IntrinsicElements;
      return <Heading>{renderInlines(block.children)}</Heading>;
    }
    case "thematicBreak":
      return <hr />;
    case "code":
      return (
        <pre>
          <code>{block.text}</code>
        </pre>
      );
  }
});

function renderInlines(nodes: readonly InlineNode[]): ReactNode[] {
  return nodes.map((node, index) => renderInline(node, index));
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
  }
}
