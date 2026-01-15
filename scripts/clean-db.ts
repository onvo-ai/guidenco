
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
});

async function cleanDatabase() {
    try {
        console.log('Cleaning up database...');

        // Delete data from dependent tables first
        await pool.query('DELETE FROM artwork_versions');
        await pool.query('DELETE FROM artworks');
        await pool.query('DELETE FROM chat_messages');
        await pool.query('DELETE FROM projects');

        // We can leave users/sessions empty or delete them too to be safe
        // If the tables exist (which they might not fully if db:push failed mid-way), this cleans them.
        // However, the issue is that db:push failed because of foreign key constraints when trying to ALTER tables.
        // If we simply empty the tables, db:push should succeed.

        console.log('Database cleaned successfully.');
    } catch (error) {
        console.error('Error cleaning database:', error);
    } finally {
        await pool.end();
    }
}

cleanDatabase();
