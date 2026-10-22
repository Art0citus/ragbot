import "dotenv/config";
import fs from "node:fs";
import pg from "pg";

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });

await db.query(fs.readFileSync("schema.sql", "utf8"));

const { rows } = await db.query(
  "SELECT table_name FROM information_schema.tables WHERE table_schema='public'"
);
console.log("Tables:", rows.map((r) => r.table_name));
await db.end();