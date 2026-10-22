import "dotenv/config";
import pg from "pg";
import { GoogleGenAI } from "@google/genai";

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// question -> the page that has the answer (null = should NOT be answerable)
const tests: { q: string; page: number | null }[] = [
  { q: "How many days do I have to request a refund?", page: 2 },
  { q: "Are ebooks refundable?", page: 2 },
  { q: "What are the support hours?", page: 3 },
  { q: "How fast does the Pro plan reply?", page: 3 },
  { q: "How much is the Basic plan?", page: 4 },
  { q: "Is GST included in the prices?", page: 4 },
  { q: "How is my data encrypted?", page: 5 },
  { q: "How long does a mobile app take to build?", page: 6 },
  { q: "Who owns the source code?", page: 6 },
  { q: "Do you offer a bug-fix warranty?", page: 6 },
  { q: "Do you offer a free trial?", page: null },
  { q: "What is the CEO's name?", page: null },
];

async function search(question: string) {
  const emb = await ai.models.embedContent({
    model: "gemini-embedding-001",
    contents: question,
    config: { outputDimensionality: 1536, taskType: "RETRIEVAL_QUERY" },
  });
  const { rows } = await db.query(
    `SELECT page, 1 - (embedding <=> $1) AS similarity
     FROM chunks ORDER BY embedding <=> $1 LIMIT 3`,
    [JSON.stringify(emb.embeddings![0].values!)]
  );
  return rows.map((r) => ({ page: r.page as number, score: Number(r.similarity) }));
}

let hit1 = 0, hit3 = 0, answerable = 0;
const answerableTop: number[] = [];
const trickTop: number[] = [];

for (const t of tests) {
  const results = await search(t.q);
  const top = results[0];

  if (t.page === null) {
    trickTop.push(top.score);
    console.log(`TRICK  top=${top.score.toFixed(3)}  ${t.q}`);
  } else {
    answerable++;
    answerableTop.push(top.score);
    const in1 = results[0].page === t.page;
    const in3 = results.some((r) => r.page === t.page);
    if (in1) hit1++;
    if (in3) hit3++;
    console.log(`${in3 ? "OK  " : "MISS"}   top=${top.score.toFixed(3)}  want p.${t.page}, got p.${results.map((r) => r.page).join(",")}  ${t.q}`);
  }
  await new Promise((r) => setTimeout(r, 700)); // be gentle with free-tier limits
}

console.log(`\nHit@1: ${hit1}/${answerable}`);
console.log(`Hit@3: ${hit3}/${answerable}`);
console.log(`Real questions, lowest top score:  ${Math.min(...answerableTop).toFixed(3)}`);
console.log(`Trick questions, highest top score: ${Math.max(...trickTop).toFixed(3)}`);
console.log(`Pick MIN_SCORE between those two numbers.`);
await db.end();