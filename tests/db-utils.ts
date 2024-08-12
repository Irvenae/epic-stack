import fs from 'node:fs'
import { faker } from '@faker-js/faker'
import bcrypt from 'bcryptjs'
import { Relations } from 'drizzle-orm'
import { type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { UniqueEnforcer } from 'enforce-unique'
import * as schema from '../app/db.server/schema.ts'

const uniqueUsernameEnforcer = new UniqueEnforcer()

export function createUser() {
  const firstName = faker.person.firstName()
  const lastName = faker.person.lastName()

  const username = uniqueUsernameEnforcer
    .enforce(() => {
      return (
        faker.string.alphanumeric({ length: 2 }) +
				'_' +
				faker.internet.userName({
				  firstName: firstName.toLowerCase(),
				  lastName: lastName.toLowerCase(),
				})
      )
    })
    .slice(0, 20)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
  return {
    username,
    name: `${firstName} ${lastName}`,
    email: `${username}@example.com`,
  }
}

export function createPassword(password: string = faker.internet.password()) {
  return {
    hash: bcrypt.hashSync(password, 10),
  }
}

let noteImages: Array<Awaited<ReturnType<typeof img>>> | undefined
export async function getNoteImages() {
  if (noteImages) return noteImages

  noteImages = await Promise.all([
    img({
      altText: 'a nice country house',
      filepath: './tests/fixtures/images/notes/0.png',
    }),
    img({
      altText: 'a city scape',
      filepath: './tests/fixtures/images/notes/1.png',
    }),
    img({
      altText: 'a sunrise',
      filepath: './tests/fixtures/images/notes/2.png',
    }),
    img({
      altText: 'a group of friends',
      filepath: './tests/fixtures/images/notes/3.png',
    }),
    img({
      altText: 'friends being inclusive of someone who looks lonely',
      filepath: './tests/fixtures/images/notes/4.png',
    }),
    img({
      altText: 'an illustration of a hot air balloon',
      filepath: './tests/fixtures/images/notes/5.png',
    }),
    img({
      altText:
				'an office full of laptops and other office equipment that look like it was abandoned in a rush out of the building in an emergency years ago.',
      filepath: './tests/fixtures/images/notes/6.png',
    }),
    img({
      altText: 'a rusty lock',
      filepath: './tests/fixtures/images/notes/7.png',
    }),
    img({
      altText: 'something very happy in nature',
      filepath: './tests/fixtures/images/notes/8.png',
    }),
    img({
      altText: `someone at the end of a cry session who's starting to feel a little better.`,
      filepath: './tests/fixtures/images/notes/9.png',
    }),
  ])

  return noteImages
}

let userImages: Array<Awaited<ReturnType<typeof img>>> | undefined
export async function getUserImages() {
  if (userImages) return userImages

  userImages = await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      img({ filepath: `./tests/fixtures/images/user/${index}.jpg` }),
    ),
  )

  return userImages
}

export async function img({
  altText,
  filepath,
}: {
	altText?: string
	filepath: string
}) {
  return {
    altText,
    contentType: filepath.endsWith('.png') ? 'image/png' : 'image/jpeg',
    blob: await fs.promises.readFile(filepath),
  }
}

export async function cleanupDb2(
  db: BetterSQLite3Database<typeof schema>,
  showLogs: boolean = true,
) {
  if (showLogs) console.log('🗑️ Emptying the entire database')

  const tablesSchema = db._.schema
  if (!tablesSchema) throw new Error('Schema not loaded')

  return db.transaction(async(trx) =>
    Promise.all(Object.entries(schema).map(async([name, table]) => {
      if (table instanceof Relations) return
      if (showLogs) console.log(`🧨 delete query for table: ${name}`)
      return trx.delete(table)
    }))
  )
}
