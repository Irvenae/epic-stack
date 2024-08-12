import { remember } from '@epic-web/remember'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../db.server/schema.ts'

export const db = remember('db', () => {
  const client = new Database(process.env.DATABASE_PATH2)
  return drizzle(client, { schema, logger: true })
})
