# Architecture

The architecture is intentionally undecided.

The public API shell is:

```tsx
<GetDown content={markdown} />
```

Design work should focus on how changing `content` can be reflected naturally and efficiently without memory leaks or unnecessary work, especially when the markdown string grows over time.
