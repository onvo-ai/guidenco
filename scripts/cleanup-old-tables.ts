import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

async function cleanupOldTables() {
  const client = await pool.connect();
  
  try {
    console.log('Dropping old tables created by Drizzle...');
    
    // BetterAuth uses singular names: user, session, account, verification
    // So we need to drop the plural ones we created: users, sessions, accounts, verification_tokens
    
    // Also drop our custom tables that we'll recreate later
    const tablesToDrop = [
      'users',
      'sessions', 
      'accounts',
      'verification_tokens',
      'chat_messages',
      'artwork_versions',
      'artworks',
      'projects'
    ];
    
    for (const table of tablesToDrop) {
      try {
        await client.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
        console.log(`✓ Dropped table: ${table}`);
      } catch (error: any) {
        console.log(`✗ Could not drop ${table}: ${error.message}`);
      }
    }
    
    console.log('\nCleanup complete!');
    console.log('BetterAuth tables (user, session, account, verification) are kept.');
    
  } catch (error) {
    console.error('Error during cleanup:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

cleanupOldTables();
