import postgres from "postgres";
const sql = postgres("postgresql://postgres:postgres@127.0.0.1:54322/postgres", {
  prepare: false, max: 1, idle_timeout: 5, connect_timeout: 10
});
try {
  const r = await sql`select current_database() as db, now() as ts,
    (select count(*) from pg_tables where schemaname='public') as tabelle`;
  console.log(r);
} catch (e) {
  console.error("ERRORE:", e.message);
} finally {
  await sql.end();
}
