import path from 'node:path'
import Database from 'better-sqlite3'
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3'
import fsExtra from 'fs-extra'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { BASE_DATABASE_PATH } from './global-setup.ts'

const databaseFile = `./tests/drizzle/data.${process.env.VITEST_POOL_ID || 0}.db`
const databasePath = path.join(process.cwd(), databaseFile)
process.env.DATABASE_PATH2 = databasePath

// @ts-ignore
let client
let db: BetterSQLite3Database<Record<string, unknown>>
beforeAll(async () => {
  const { schema } = await import('#app/db.server/index.ts')
  await fsExtra.copyFile(BASE_DATABASE_PATH, databasePath)
  client = new Database(process.env.DATABASE_PATH2)
  db = drizzle(client, { schema })
})

// we *must* use dynamic imports here so the process.env.DATABASE_URL is set
// before prisma is imported and initialized
afterEach(async () => {
  const { cleanupDb2 } = await import('#tests/db-utils.ts')
  // @ts-ignore
  await cleanupDb2(db, false)
})

afterAll(async () => {
  // @ts-ignore
  client.close()
  await fsExtra.remove(databasePath)
})
