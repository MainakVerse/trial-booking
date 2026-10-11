import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pool } from "../lib/db";

async function main() {
  const sql = readFileSync(join(__dirname, "..", "db", "schema.sql"), "utf8");
  await pool().query(sql);
  const { rows } = await pool().query(
    "select table_name from information_schema.tables where table_schema = 'public' order by 1",
  );
  console.log("Schema applied. Tables:", rows.map((r) => r.table_name).join(", "));
  await pool().end();
}

main().catch((e) => {
  console.error("Migration failed:", e.message);
  process.exit(1);
});
