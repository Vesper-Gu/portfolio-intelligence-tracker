# Backend Architecture

## Design Goals

- Keep the MVP useful without coupling it to one database SDK.
- Make Supabase the production persistence target through versioned SQL migrations.
- Keep RAG separate so retrieval experiments do not destabilize core holdings data.
- Preserve API contracts that the frontend can depend on before the persistence layer is finalized.

## Layers

```text
HTTP router
  -> PortfolioService
    -> Repository interface
      -> MemoryRepository now
      -> SupabaseRepository later
```

## Current Persistence Strategy

The running local server uses `MemoryRepository` seeded from `src/repositories/seedData.js`. This keeps frontend integration unblocked without requiring Supabase credentials on day one.

Production persistence is represented by `supabase/migrations/0001_core_schema.sql`. When Supabase credentials are available, add `SupabaseRepository` behind the same methods used by `PortfolioService`.

## RAG Boundary

RAG should be a separate module or service. It can read:

- `holdings.source_text`
- `holdings.note`
- `holdings.ticker`
- `holdings.asset_type`
- `holdings.action`
- `holdings.recorded_at`
- KOL/source metadata

It should not own canonical holdings data. It may maintain its own embedding tables or vector indexes, but those should be added in a dedicated migration owned by the RAG workstream.

## Next Backend Milestones

1. Add Supabase repository implementation.
2. Add auth and row-level security policy decisions.
3. Add ingestion confirmation flow that converts accepted `ingest_items` into `holdings`.
4. Add alert rule evaluator and event log.
5. Add pagination and sorting contracts before large datasets.

