import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

async function addGoogleFontsColumn() {
  const client = await pool.connect();
  
  try {
    console.log('Adding google_fonts column to artwork_versions table...');
    
    await client.query(`
      ALTER TABLE artwork_versions 
      ADD COLUMN IF NOT EXISTS google_fonts text[];
    `);
    
    console.log('✅ Column added successfully!');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

addGoogleFontsColumn();
