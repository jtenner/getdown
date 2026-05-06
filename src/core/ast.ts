export interface ParsedDocument {
  readonly content: string;
  readonly blocks: readonly MarkdownBlockNode[];
}

export type MarkdownBlockNode =
  | ParagraphBlock
  | HeadingBlock
  | ThematicBreakBlock
  | CodeBlock;

interface BaseBlock {
  readonly id: string;
  readonly kind: MarkdownBlockNode["kind"];
  readonly raw: string;
  readonly start: number;
  readonly end: number;
}

export interface ParagraphBlock extends Omit<BaseBlock, "kind"> {
  readonly kind: "paragraph";
  readonly text: string;
  readonly children: readonly InlineNode[];
}

export interface HeadingBlock extends Omit<BaseBlock, "kind"> {
  readonly kind: "heading";
  readonly level: 1 | 2 | 3 | 4 | 5 | 6;
  readonly text: string;
  readonly children: readonly InlineNode[];
}

export interface ThematicBreakBlock extends Omit<BaseBlock, "kind"> {
  readonly kind: "thematicBreak";
}

export interface CodeBlock extends Omit<BaseBlock, "kind"> {
  readonly kind: "code";
  readonly text: string;
}

export type InlineNode = TextNode | BreakNode | EmphasisNode | StrongNode | DeleteNode | CodeSpanNode | LinkNode;

export interface TextNode {
  readonly kind: "text";
  readonly value: string;
}

export interface BreakNode {
  readonly kind: "break";
}

export interface EmphasisNode {
  readonly kind: "emphasis";
  readonly children: readonly InlineNode[];
}

export interface StrongNode {
  readonly kind: "strong";
  readonly children: readonly InlineNode[];
}

export interface DeleteNode {
  readonly kind: "delete";
  readonly children: readonly InlineNode[];
}

export interface CodeSpanNode {
  readonly kind: "code";
  readonly value: string;
}

export interface LinkNode {
  readonly kind: "link";
  readonly href: string;
  readonly title?: string;
  readonly children: readonly InlineNode[];
}
