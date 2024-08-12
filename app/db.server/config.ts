import { type Config } from 'drizzle-kit'

if (!('DATABASE_PATH2' in process.env)) {
  throw new Error('DATABASE_PATH2 not found')
}

export default {
  dialect: 'sqlite',
  schema: './app/db.server/schema.ts',
  out: './app/db.server/migrations',
  dbCredentials: {
    url: process.env.DATABASE_PATH2!,
  },
  strict: true,
} satisfies Config
