import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

// Load environment variables from .env
dotenv.config({ path: ".env" });

// if (!process.env.POSTGRES_URL) {
//   throw new Error("POSTGRES_URL is not set in .env");
// }

console.log("Using POSTGRES_URL:", process.env.POSTGRES_URL);
export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.POSTGRES_URL || "",
  },
});
