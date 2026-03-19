const { Client } = require("pg");
const dotenv = require("dotenv");

dotenv.config({ path: ".env.local" });

async function resetDatabase() {
  const connectionString = process.env.POSTGRES_URL;

  if (!connectionString) {
    throw new Error("POSTGRES_URL is not set in .env.local");
  }

  const client = new Client({
    connectionString,
  });

  await client.connect();

  try {
    await client.query("BEGIN");
    await client.query("DROP SCHEMA IF EXISTS public CASCADE");
    await client.query("CREATE SCHEMA public");
    await client.query("GRANT ALL ON SCHEMA public TO CURRENT_USER");
    await client.query("GRANT ALL ON SCHEMA public TO public");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

resetDatabase()
  .then(() => {
    console.log("Database schema reset complete.");
  })
  .catch((error) => {
    console.error("Failed to reset database schema.");
    console.error(error);
    process.exit(1);
  });
