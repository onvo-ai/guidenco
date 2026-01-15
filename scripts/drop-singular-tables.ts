import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

async function dropSingularTables() {
  const client = await pool.connect();
  
  try {
    console.log('Dropping singular BetterAuth tables...');
    
    const tablesToDrop = ['user', 'session', 'account', 'verification'];
    
    for (const table of tablesToDrop) {
      try {
        await client.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
        console.log(`✓ Dropped table: ${table}`);
      } catch (error: any) {
        console.log(`✗ Could not drop ${table}: ${error.message}`);
      }
    }
    
    console.log('\nDone! Now run: npx @better-auth/cli@latest migrate');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

dropSingularTables();
