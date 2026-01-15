
import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
});

async function checkDb() {
    try {
        console.log('Checking database content...');

        const users = await pool.query('SELECT * FROM users');
        console.log('Users:', users.rows);

        const sessions = await pool.query('SELECT * FROM sessions');
        console.log('Sessions:', sessions.rows);

        const accounts = await pool.query('SELECT * FROM accounts');
        console.log('Accounts:', accounts.rows);

    } catch (error) {
        console.error('Error checking database:', error);
    } finally {
        await pool.end();
    }
}

checkDb();
