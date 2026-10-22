import "dotenv/config";
import pg from "pg";
import { GoogleGenAI } from "@google/genai";

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const MIN_SCORE = 0.5; // below this, a chunk is "not relevant". Tune it later.
const TOP_K = 5;

async function main() {
  const question = process.argv.slice(2).join(" ");
  if (!question) throw new Error('Usage: npx tsx ask.ts "your question"');

  // 1. EMBED the question (same model as ingest, but as a QUERY)
  const emb = await ai.models.embedContent({
    model: "gemini-embedding-001",
    contents: question,
    config: { outputDimensionality: 1536, taskType: "RETRIEVAL_QUERY" },
  });
  const qVec = emb.embeddings![0].values!;

  // 2. RETRIEVE the closest chunks
  const { rows } = await db.query(
    `SELECT c.content, c.page, d.name,
            1 - (c.embedding <=> $1) AS similarity
     FROM chunks c
     JOIN documents d ON d.id = c.document_id
     ORDER BY c.embedding <=> $1
     LIMIT $2`,
    [JSON.stringify(qVec), TOP_K]
  );

  console.log("\n--- Retrieved chunks ---");
  for (const r of rows) {
    console.log(`${Number(r.similarity).toFixed(3)}  [${r.name}, p.${r.page}]  ${r.content.slice(0, 60)}...`);
  }

  // 3. CUTOFF: drop weak matches
  const best = Number(rows[0].similarity);
const good = rows.filter(
  (r) =>
    Number(r.similarity) >= MIN_SCORE &&   // not completely unrelated
    Number(r.similarity) >= best - 0.05    // close to the best match
);
  if (good.length === 0) {
    console.log("\nAnswer: I don't know. I couldn't find this in the documents.");
    await db.end();
    return;
  }

  // 4. BUILD the prompt
  const context = good
    .map((r, i) => `[${i + 1}] (${r.name}, page ${r.page})\n${r.content}`)
    .join("\n\n");

  const system =
    "You answer questions using ONLY the context provided. " +
    "If the answer is not in the context, say \"I don't know\". " +
    "Keep answers short. After each fact, cite the source like [policy.pdf, p.2].";

  // 5. ASK the LLM
  const res = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `CONTEXT:\n${context}\n\nQUESTION: ${question}`,
    config: { systemInstruction: system, temperature: 0.2 },
  });

  console.log("\n--- Answer ---");
  console.log(res.text);
  await db.end();
}

main();