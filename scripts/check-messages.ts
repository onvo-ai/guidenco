import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

async function checkMessages() {
  const client = await pool.connect();
  
  try {
    const projectId = '9805bb5d-0b79-45a5-b813-330a9e05d288';
    
    console.log('🔍 Checking messages for project:', projectId);
    console.log('─────────────────────────────────────────\n');
    
    const result = await client.query(
      `SELECT id, role, content, created_at 
       FROM chat_messages 
       WHERE project_id = $1 
       ORDER BY created_at ASC`,
      [projectId]
    );
    
    console.log(`Found ${result.rows.length} messages:\n`);
    
    for (const row of result.rows) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('Role:', row.role);
      console.log('Created:', row.created_at);
      console.log('Content:', JSON.stringify(row.content, null, 2));
      console.log('');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

checkMessages();
