/**
 * Seed exercises in small batches. Env: MYGYM_DB_PASSWORD
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const REF = 'gkcjwunfgzhidqyyhhik';
const PASSWORD = process.env.MYGYM_DB_PASSWORD;
if (!PASSWORD) {
  console.error('Set MYGYM_DB_PASSWORD');
  process.exit(1);
}

function esc(s) {
  return String(s || '').replace(/'/g, "''");
}

async function connect() {
  const client = new Client({
    connectionString:
      `postgresql://postgres.${REF}:${encodeURIComponent(PASSWORD)}@aws-0-eu-west-1.pooler.supabase.com:5432/postgres`,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000
  });
  client.on('error', () => {});
  await client.connect();
  return client;
}

(async () => {
  const j = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'data', 'exercises.json'), 'utf8')
  );
  const list = j.exercises;
  const batchSize = 8;
  for (let i = 0; i < list.length; i += batchSize) {
    const batch = list.slice(i, i + batchSize);
    const values = batch
      .map(
        (ex) =>
          `('${esc(ex.id)}','${esc(ex.name)}','${esc(ex.category)}','${esc(ex.muscle)}','${esc(ex.type)}','${esc(ex.description)}')`
      )
      .join(',');
    const sql = `
      INSERT INTO public.exercises (id, name, category, muscle, type, description)
      VALUES ${values}
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        category = EXCLUDED.category,
        muscle = EXCLUDED.muscle,
        type = EXCLUDED.type,
        description = EXCLUDED.description
    `;
    const client = await connect();
    try {
      await client.query(sql);
      console.log(`batch ${i}-${i + batch.length - 1} ok`);
    } finally {
      await client.end();
    }
  }
  const client = await connect();
  const r = await client.query('select count(*)::int as n from public.exercises');
  console.log('TOTAL', r.rows[0].n);
  await client.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
