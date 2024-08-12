import { test as base } from '@playwright/test'
import { eq } from 'drizzle-orm'
import * as setCookieParser from 'set-cookie-parser'
import { type InferResultType, db, schema } from '#app/db.server'
import {
  getPasswordHash,
  getSessionExpirationDate,
  sessionKey,
} from '#app/utils/auth.server.ts'
import { MOCK_CODE_GITHUB_HEADER } from '#app/utils/providers/constants.js'
import { normalizeEmail } from '#app/utils/providers/provider.js'
import { authSessionStorage } from '#app/utils/session.server.ts'
import { createUser } from './db-utils.ts'
import {
  type GitHubUser,
  deleteGitHubUser,
  insertGitHubUser,
} from './mocks/github.ts'

export * from './db-utils.ts'

type GetOrInsertUserOptions = {
	id?: string
	username?: InferResultType<'user'>['username']
	password?: string
	email?: InferResultType<'user'>['email']
}

type User = {
	id: string
	email: string
	username: string
	name: string | null
}

async function getOrInsertUser({
  id,
  username,
  password,
  email,
}: GetOrInsertUserOptions = {}): Promise<User> {
  if (id) {
    return (await db.query.user.findFirst({
      columns: { id: true, email: true, username: true, name: true },
      where: eq(schema.user.id, id),
    }))!
  } else {
    const userData = createUser()
    username ??= userData.username
    password ??= userData.username
    email ??= userData.email
    return await db.transaction(async (trx) => {
      const user = (
				await trx
				  .insert(schema.user)
				  .values({
				    ...userData,
				    email: email!,
				    username: username!,
				  })
				  .returning({
				    id: schema.user.id,
				    email: schema.user.email,
				    username: schema.user.username,
				    name: schema.user.name,
				  })
			)[0]!

      const role = (
				await trx
				  .select({ id: schema.role.id })
				  .from(schema.role)
				  .where(eq(schema.role.name, 'user'))
				  .limit(1)
			)[0]!
      if (!role) throw new Error('Could not find user role')
      await trx.insert(schema.roleToUser).values({
        userId: user.id,
        roleId: role.id,
      })
      await trx.insert(schema.password).values({
        hash: await getPasswordHash(password!),
        userId: user.id,
      })
      return user
    })
  }
}

export const test = base.extend<{
	insertNewUser(options?: GetOrInsertUserOptions): Promise<User>
	login(options?: GetOrInsertUserOptions): Promise<User>
	prepareGitHubUser(): Promise<GitHubUser>
	  }>({
	    insertNewUser: async ({}, use) => {
	      let userId: string | undefined = undefined
	      await use(async (options) => {
	        const user = await getOrInsertUser(options)
	        userId = user.id
	        return user
	      })
	      await db
	        .delete(schema.user)
	        .where(eq(schema.user.id, userId!))
	        .catch(() => {})
	    },
	    login: async ({ page }, use) => {
	      let userId: string | undefined = undefined
	      await use(async (options) => {
	        const user = await getOrInsertUser(options)
	        userId = user.id
	        const session = (
				await db
				  .insert(schema.session)
				  .values({
				    expiresAt: getSessionExpirationDate(),
				    userId: user.id,
				  })
				  .returning({ id: schema.session.id })
			)[0]!

	        const authSession = await authSessionStorage.getSession()
	        authSession.set(sessionKey, session.id)
	        const cookieConfig = setCookieParser.parseString(
	          await authSessionStorage.commitSession(authSession),
	        )
	        const newConfig = {
	          ...cookieConfig,
	          domain: 'localhost',
	          expires: cookieConfig.expires?.getTime(),
	          sameSite: cookieConfig.sameSite as 'Strict' | 'Lax' | 'None',
	        }
	        await page.context().addCookies([newConfig])
	        return user
	      })
	      await db.delete(schema.user).where(eq(schema.user.id, userId!))
	    },
	    prepareGitHubUser: async ({ page }, use, testInfo) => {
	      await page.route(/\/auth\/github(?!\/callback)/, async (route, request) => {
	        const headers = {
	          ...request.headers(),
	          [MOCK_CODE_GITHUB_HEADER]: testInfo.testId,
	        }
	        await route.continue({ headers })
	      })

	      let ghUser: GitHubUser | null = null
	      await use(async () => {
	        const newGitHubUser = await insertGitHubUser(testInfo.testId)!
	        ghUser = newGitHubUser
	        return newGitHubUser
	      })

	      const user = await db.query.user.findFirst({
	        columns: { id: true, name: true },
	        where: eq(schema.user.email, normalizeEmail(ghUser!.primaryEmail)),
	      })
	      if (user) {
	        await db.delete(schema.user).where(eq(schema.user.id, user.id))
	        await db.delete(schema.session).where(eq(schema.session.userId, user.id))
	        await deleteGitHubUser(ghUser!.primaryEmail)
	      }
	    },
	  })
export const { expect } = test

/**
 * This allows you to wait for something (like an email to be available).
 *
 * It calls the callback every 50ms until it returns a value (and does not throw
 * an error). After the timeout, it will throw the last error that was thrown or
 * throw the error message provided as a fallback
 */
export async function waitFor<ReturnValue>(
  cb: () => ReturnValue | Promise<ReturnValue>,
  {
    errorMessage,
    timeout = 5000,
  }: { errorMessage?: string; timeout?: number } = {},
) {
  const endTime = Date.now() + timeout
  let lastError: unknown = new Error(errorMessage)
  while (Date.now() < endTime) {
    try {
      const response = await cb()
      if (response) return response
    } catch (e: unknown) {
      lastError = e
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  throw lastError
}
