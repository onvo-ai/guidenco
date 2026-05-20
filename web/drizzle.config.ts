import type { Config } from 'drizzle-kit'
import { config } from 'dotenv'
import { expand } from 'dotenv-expand'

// Load .env.local for drizzle-kit (Next.js doesn't auto-load this for CLI tools)
expand(config({ path: '.env.local' }))
expand(config({ path: '.env' }))

export default {
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config
