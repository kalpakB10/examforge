# Tests

Two flavors:

- **Unit tests** live next to the code as `*.test.ts` (per service). Run with
  `npm test` inside a service. Pure JS/TS — no DB, no HTTP.

- **Integration + E2E tests** live in this `tests/` dir and hit a running
  stack over HTTP. They need docker compose up and are driven by
  `scripts/test.sh` (which stands up the stack, runs the tests, tears down).

## Layout

```
tests/
├── package.json               # test-only deps (playwright, vitest, undici)
├── integration/               # HTTP tests via undici — auth, ownership, rate limits
│   └── ownership.test.ts
└── e2e/                       # Playwright browser tests — teacher + student flows
    └── teacher-happy-path.spec.ts
```

## Running

Quick unit tests only (single service):
```bash
cd services/question-bank && npm test
```

Full test suite (unit + integration + E2E) against a fresh stack:
```bash
./scripts/test.sh
```
