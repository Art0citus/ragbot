import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { GoogleGenAI } from "@google/genai";
import pdf from "pdf-parse/lib/pdf-parse.js";

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// 1. PARSE
async function parsePdf(file: string) {
  const pages: string[] = [];
  await pdf(fs.readFileSync(file), {
    pagerender: async (page: any) => {
      const content = await page.getTextContent();
      const text = content.items.map((i: any) => i.str).join(" ");
      pages.push(text);
      return text;
    },
  });
  return pages;
}

// 2. CHUNK
function chunkText(text: string, maxChars = 1500, overlap = 200) {
  const paragraphs = text.split(/\n\s*\n/);
  const chunks: string[] = [];
  let current = "";
  for (const p of paragraphs) {
    if ((current + "\n\n" + p).length > maxChars && current) {
      chunks.push(current.trim());
      current = current.slice(-overlap) + "\n\n" + p;
    } else {
      current = current ? current + "\n\n" + p : p;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// 3. EMBED (Gemini)
async function embed(texts: string[]) {
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += 20) {
    const res = await ai.models.embedContent({
      model: "gemini-embedding-001",
      contents: texts.slice(i, i + 20),
      config: { outputDimensionality: 1536, taskType: "RETRIEVAL_DOCUMENT" },
    });
    vectors.push(...res.embeddings!.map((e) => e.values!));
  }
  return vectors;
}

// 4. STORE
async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: npx tsx ingest.ts ./docs/policy.pdf");

  const pages = await parsePdf(file);
  console.log(`Parsed ${pages.length} pages`);

  const items: { text: string; page: number }[] = [];
  pages.forEach((pageText, i) => {
    for (const c of chunkText(pageText)) {
      if (c.length > 30) items.push({ text: c, page: i + 1 });
    }
  });
  console.log(`Made ${items.length} chunks`);

  const vectors = await embed(items.map((i) => i.text));
  console.log(`Vector length: ${vectors[0].length}`); // should print 1536

  const doc = await db.query(
    "INSERT INTO documents (name) VALUES ($1) RETURNING id",
    [path.basename(file)]
  );
  const docId = doc.rows[0].id;

  for (let i = 0; i < items.length; i++) {
    await db.query(
      "INSERT INTO chunks (document_id, content, page, embedding) VALUES ($1, $2, $3, $4)",
      [docId, items[i].text, items[i].page, JSON.stringify(vectors[i])]
    );
  }
  console.log(`Saved ${items.length} chunks for ${path.basename(file)}`);
  await db.end();
}

main();