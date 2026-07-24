/**
 * Apply schema/seed with reconnect-per-statement (pooler-friendly).
 * Env: MYGYM_DB_PASSWORD
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

const HOSTS = [
  'aws-0-eu-west-1.pooler.supabase.com',
  'aws-1-eu-west-1.pooler.supabase.com',
  'aws-0-eu-central-1.pooler.supabase.com',
  'aws-1-eu-central-1.pooler.supabase.com'
];

function splitSql(sql) {
  const lines = sql.split(/\r?\n/).map((line) => {
    const i = line.indexOf('--');
    return i >= 0 ? line.slice(0, i) : line;
  });
  const cleaned = lines.join('\n');
  const parts = [];
  let buf = '';
  let inDollar = false;
  for (let i = 0; i < cleaned.length; i++) {
    if (cleaned.startsWith('$$', i)) {
      inDollar = !inDollar;
      buf += '$$';
      i++;
      continue;
    }
    if (cleaned[i] === ';' && !inDollar) {
      const stmt = buf.trim();
      if (stmt) parts.push(stmt);
      buf = '';
      continue;
    }
    buf += cleaned[i];
  }
  const tail = buf.trim();
  if (tail) parts.push(tail);
  return parts;
}

async function connect() {
  let lastErr;
  for (const host of HOSTS) {
    const connectionString =
      `postgresql://postgres.${REF}:${encodeURIComponent(PASSWORD)}@${host}:5432/postgres`;
    const client = new Client({
      connectionString,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000
    });
    try {
      await client.connect();
      console.log(`Connected via ${host}`);
      return client;
    } catch (e) {
      lastErr = e;
      try { await client.end(); } catch (_) {}
    }
  }
  throw lastErr || new Error('no host');
}

async function exec(sql) {
  let client = await connect();
  try {
    await client.query("set statement_timeout = '60s'");
    await client.query(sql);
  } finally {
    try { await client.end(); } catch (_) {}
  }
}

async function runFile(filePath) {
  const sql = fs.readFileSync(filePath, 'utf8');
  const stmts = splitSql(sql);
  console.log(`\n=== ${path.basename(filePath)}: ${stmts.length} statements ===`);
  for (let i = 0; i < stmts.length; i++) {
    const s = stmts[i];
    const preview = s.replace(/\s+/g, ' ').slice(0, 90);
    process.stdout.write(`[${i + 1}/${stmts.length}] ${preview}... `);
    try {
      await exec(s);
      console.log('ok');
    } catch (e) {
      if (/already exists/i.test(e.message) || /duplicate/i.test(e.message)) {
        console.log('skip');
      } else {
        console.log('FAIL: ' + e.message);
        throw e;
      }
    }
  }
}

(async () => {
  await runFile(path.join(__dirname, '..', 'supabase', 'schema.sql'));
  await runFile(path.join(__dirname, '..', 'supabase', 'seed_exercises.sql'));

  const client = await connect();
  try {
    const count = await client.query('select count(*)::int as n from public.exercises');
    console.log(`\nExercises: ${count.rows[0].n}`);
    const tables = await client.query(`
      select table_name from information_schema.tables
      where table_schema='public' order by 1
    `);
    console.log('Tables:', tables.rows.map((r) => r.table_name).join(', '));
  } finally {
    await client.end();
  }
  console.log('DONE');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
