import path from 'node:path'
import { execaCommand } from 'execa'
import fsExtra from 'fs-extra'

export const BASE_DATABASE_PATH = path.join(
  process.cwd(),
  `./tests/drizzle/base.db`,
)

export async function setup() {
  const databaseExists = await fsExtra.pathExists(BASE_DATABASE_PATH)

  if (databaseExists) {
    const databaseLastModifiedAt = (await fsExtra.stat(BASE_DATABASE_PATH))
      .mtime
    const schemaLastModifiedAt1 = (
      await fsExtra.stat('./app/db.server/items.schema.ts')
    ).mtime
    const schemaLastModifiedAt2 = (
      await fsExtra.stat('./app/db.server/relations.schema.ts')
    ).mtime
    const schemaLastModifiedAt =
			schemaLastModifiedAt1 > schemaLastModifiedAt2
			  ? schemaLastModifiedAt1
			  : schemaLastModifiedAt2

    if (schemaLastModifiedAt < databaseLastModifiedAt) {
      return
    }

    await execaCommand(`rm ${BASE_DATABASE_PATH}`)
  }

  await execaCommand('npm run db:apply -- --force', {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_PATH2: BASE_DATABASE_PATH,
    },
  })
}
