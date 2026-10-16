# React Component Conventions

## File layout

`App` is the only component that lives directly in `src/`. Every other component gets its own directory under `src/`, named after the component in PascalCase. The directory holds the component, its tests and its styles, all using the same name:

```
src/
├── App.tsx
├── App.test.tsx
└── ComponentName/
    ├── ComponentName.tsx
    ├── ComponentName.test.tsx
    └── ComponentName.scss
```

- `ComponentName.tsx` — the component itself.
- `ComponentName.test.tsx` — its tests. See [testing.md](testing.md) for how tests are written and run.
- `ComponentName.scss` — its styles, imported by the component with `import './ComponentName.scss'`.
