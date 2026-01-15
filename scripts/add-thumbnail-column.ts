import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

async function addThumbnailColumn() {
  const client = await pool.connect();
  
  try {
    console.log('Adding thumbnail column to artworks table...');
    
    await client.query(`
      ALTER TABLE artworks 
      ADD COLUMN IF NOT EXISTS thumbnail TEXT;
    `);
    
    console.log('✅ Thumbnail column added successfully!');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

addThumbnailColumn();
