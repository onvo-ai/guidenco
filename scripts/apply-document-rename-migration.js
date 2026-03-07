require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');

async function main() {
  const repo = path.resolve(__dirname, '..');
  const drizzleDir = path.join(repo, 'drizzle');
  const files = [
    '0000_needy_kingpin.sql',
    '0001_curvy_blackheart.sql',
    '0002_agent_settings.sql',
    '0003_svg_video_versions.sql',
    '0004_document_rename_breaking.sql',
  ];

  const client = new Client({ connectionString: process.env.POSTGRES_URL });
  await client.connect();

  try {
    await client.query('BEGIN');

    const tableCheck = await client.query(
      "select table_name from information_schema.tables where table_schema='public' and table_name in ('artworks','artwork_versions','documents','document_versions') order by table_name"
    );
    const names = tableCheck.rows.map((row) => row.table_name);

    if (names.includes('artworks')) {
      const sql = fs.readFileSync(path.join(drizzleDir, '0004_document_rename_breaking.sql'), 'utf8');
      const statements = sql
        .split('--> statement-breakpoint')
        .map((statement) => statement.trim())
        .filter(Boolean);

      for (const statement of statements) {
        await client.query(statement);
      }
      console.log('Applied 0004 document rename SQL');
    } else {
      console.log('0004 schema changes already present, skipping SQL execution');
      await client.query("update projects set type = 'document' where type = 'artwork'");
    }

    const currentRows = await client.query('select id from drizzle.__drizzle_migrations order by id');
    const hashes = files.map((file) => {
      const content = fs.readFileSync(path.join(drizzleDir, file), 'utf8');
      return crypto.createHash('sha256').update(content).digest('hex');
    });

    for (let i = 0; i < Math.min(currentRows.rows.length, hashes.length); i += 1) {
      await client.query('update drizzle.__drizzle_migrations set hash = $1 where id = $2', [hashes[i], currentRows.rows[i].id]);
    }

    for (let i = currentRows.rows.length; i < hashes.length; i += 1) {
      await client.query('insert into drizzle.__drizzle_migrations(hash, created_at) values ($1, $2)', [hashes[i], Date.now() + i]);
    }

    await client.query('COMMIT');
    console.log('Resynced drizzle migration hashes');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
