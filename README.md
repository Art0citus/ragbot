# RAG Knowledge Assistant

Ask questions about your documents and get answers with source citations.

## How it works
PDF → parse → chunk → embed (Gemini) → store in Postgres + pgvector
Question → embed → retrieve top chunks → LLM answers using only that context

## Results
- Retrieval eval: 10/10 hit@1 and hit@3 on a 10-question test set
- Unanswerable questions are handled with an "I don't know" rule

## Stack
TypeScript, Node.js, PostgreSQL, pgvector, Google Gemini

## Run it
```bash
cp .env.example .env     # add your Gemini key
docker compose up -d
npx tsx setup-db.ts
npx tsx ingest.ts ./docs/policy.pdf
npx tsx ask.ts "How many days do I have to request a refund?"
npx tsx eval.ts
```

## Roadmap
- [ ] Streaming API
- [ ] Chat UI (Next.js)
- [ ] Embeddable widget
- [ ] Admin dashboard
