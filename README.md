# get-down

A React component API shell for rendering GitHub Flavored Markdown.

## API

```tsx
import { GetDown } from "get-down";

export function MarkdownView({ markdown }: { markdown: string }) {
  return <GetDown content={markdown} />;
}
```

`content` is the complete GitHub Flavored Markdown string for the current render.

## Development

```bash
bun test
bun run typecheck
```
