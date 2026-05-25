# Backend API Contract

Base URL for local development: `http://localhost:4317`

## Response Envelope

Success:

```json
{ "data": {} }
```

Error:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "ticker must be a string"
  }
}
```

## Health

`GET /health`

Returns service liveness.

## KOLs

`GET /api/kols`

Returns tracked KOL accounts.

`POST /api/kols`

```json
{
  "handle": "@Investor_X",
  "platform": "twitter",
  "displayName": "Investor X",
  "tags": ["AI", "growth"],
  "trustScore": 0.91
}
```

## Sources

`GET /api/sources`

Returns configured data sources.

`POST /api/sources`

```json
{
  "name": "@Investor_X X account",
  "sourceType": "twitter",
  "platform": "twitter",
  "url": "https://x.example/investor_x",
  "trustLevel": "high"
}
```

## Holdings

`GET /api/holdings`

Optional query params:

- `ticker=NVDA`
- `kolId=kol-investor-x`

`POST /api/holdings`

```json
{
  "kolId": "kol-investor-x",
  "sourceId": "src-investor-x-twitter",
  "ticker": "NVDA",
  "assetType": "stock",
  "action": "add",
  "weightPct": 27,
  "recordedAt": "2026-05-12T08:00:00.000Z",
  "sourceText": "Added to NVDA again after earnings.",
  "extractionConfidence": 0.94,
  "fieldConfidence": {
    "ticker": 0.99,
    "weightPct": 0.94,
    "action": 0.86
  },
  "isVerified": true,
  "note": "AI backlog",
  "userTags": ["AI"]
}
```

## Consensus Matrix

`GET /api/consensus`

Returns ticker-level aggregation for the dashboard and matrix screens:

- KOL count
- average weight
- add/trim counts
- consensus score
- latest recorded timestamp

## Ingest Queue

`GET /api/ingest`

Optional query params:

- `status=pending_review`

`POST /api/ingest`

Stores a parsed extraction candidate before human confirmation.

`PATCH /api/ingest/:id`

```json
{ "status": "accepted" }
```

Allowed statuses:

- `pending_review`
- `accepted`
- `rejected`
- `needs_manual_review`

## Alert Rules

`GET /api/alert-rules`

`POST /api/alert-rules`

```json
{
  "name": "NVDA consensus threshold",
  "ruleType": "consensus_threshold",
  "config": {
    "ticker": "NVDA",
    "minKols": 5,
    "windowDays": 7
  },
  "status": "active"
}
```

## Quality

`GET /api/quality/summary`

Returns verification and extraction confidence metrics for the data quality screen.

## RAG Boundary

This backend does not implement RAG retrieval, embeddings, reranking, or answer synthesis. A future RAG module should consume canonical `holdings`, `sources`, and `kols` records through a stable read interface and publish its own `/api/rag/*` contract.

