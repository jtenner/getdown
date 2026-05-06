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
bun run perf:baseline
```

Performance baselines live in `perf/baseline.tsx`. Use `bun run perf:baseline:save` to write a timestamped JSON snapshot under `perf/baselines/` for comparing streaming parser speed and GC pressure over time.
