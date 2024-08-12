import { redirect } from '@remix-run/node'
import bcrypt from 'bcryptjs'
import { and, eq, gt, inArray } from 'drizzle-orm'
import { Authenticator } from 'remix-auth'
import { safeRedirect } from 'remix-utils/safe-redirect'
import { db, schema } from '#app/db.server'
import { connectionSessionStorage, providers } from './connections.server.ts'
import { combineHeaders, downloadFile } from './misc.tsx'
import { type ProviderUser } from './providers/provider.ts'
import { authSessionStorage } from './session.server.ts'

export const SESSION_EXPIRATION_TIME = 1000 * 60 * 60 * 24 * 30
export const getSessionExpirationDate = () =>
  Date.now() + SESSION_EXPIRATION_TIME

export const sessionKey = 'sessionId'

export const authenticator = new Authenticator<ProviderUser>(
  connectionSessionStorage,
)

for (const [providerName, provider] of Object.entries(providers)) {
  authenticator.use(provider.getAuthStrategy(), providerName)
}

export async function getUserId(request: Request) {
  const authSession = await authSessionStorage.getSession(
    request.headers.get('cookie'),
  )
  const currentTime = Date.now()
  const sessionId = authSession.get(sessionKey)
  if (!sessionId) return null
  const userId = (
    await db.query.session.findFirst({
      columns: { userId: true },
      where: and(
        eq(schema.session.id, sessionId),
        gt(schema.session.expiresAt, currentTime),
      ),
    })
  )?.userId
  if (!userId) {
    throw redirect('/', {
      headers: {
        'set-cookie': await authSessionStorage.destroySession(authSession),
      },
    })
  }
  return userId
}

export async function requireUserId(
  request: Request,
  { redirectTo }: { redirectTo?: string | null } = {},
) {
  const userId = await getUserId(request)
  if (!userId) {
    const requestUrl = new URL(request.url)
    redirectTo =
			redirectTo === null
			  ? null
			  : (redirectTo ?? `${requestUrl.pathname}${requestUrl.search}`)
    const loginParams = redirectTo ? new URLSearchParams({ redirectTo }) : null
    const loginRedirect = ['/login', loginParams?.toString()]
      .filter(Boolean)
      .join('?')
    throw redirect(loginRedirect)
  }
  return userId
}

export async function requireAnonymous(request: Request) {
  const userId = await getUserId(request)
  if (userId) {
    throw redirect('/')
  }
}

export async function login({
  username,
  password,
}: {
	username: string
	password: string
}) {
  const user = await verifyUserPassword({ username }, password)
  if (!user) return null
  const session = (
    await db
      .insert(schema.session)
      .values({
        expiresAt: getSessionExpirationDate(),
        userId: user.id,
      })
      .returning({
        id: schema.session.id,
        expiresAt: schema.session.expiresAt,
        userId: schema.session.userId,
      })
  )?.[0]
  return session
}

export async function resetUserPassword({
  username,
  password,
}: {
	username: string
	password: string
}) {
  const hashedPassword = await getPasswordHash(password)
  return db
    .update(schema.password)
    .set({
      hash: hashedPassword,
    })
    .where(
      inArray(
        schema.password.userId,
        db
          .select({ id: schema.user.id })
          .from(schema.user)
          .limit(1)
          .where(eq(schema.user.username, username)),
      ),
    )
}

export async function signup({
  email,
  username,
  password,
  name,
}: {
	email: string
	username: string
	name?: string
	password: string
}) {
  const hashedPassword = await getPasswordHash(password)

  return await db.transaction(async (trx) => {
    const userId = (
			await trx
			  .insert(schema.user)
			  .values({
			    email,
			    username,
			    name,
			  })
			  .returning({ id: schema.user.id })
		)?.[0]?.id!
    await trx.insert(schema.password).values({
      hash: hashedPassword,
      userId,
    })
    const roleId = (
      await trx
        .select({ id: schema.role.id })
        .from(schema.role)
        .where(eq(schema.role.name, 'user'))
    )?.[0]?.id
    if (!roleId) {
      console.error('No user role found, cannot create user')
      trx.rollback()
      return
    }

    await trx.insert(schema.roleToUser).values({
      roleId,
      userId,
    })
    const [session] = await trx
      .insert(schema.session)
      .values({
        expiresAt: getSessionExpirationDate(),
        userId,
      })
      .returning({ id: schema.session.id, expiresAt: schema.session.expiresAt })

    return session
  })
}

export async function signupWithConnection({
  email,
  username,
  name,
  providerId,
  providerName,
  imageUrl,
}: {
	email: string
	username: string
	name?: string
	providerId: string
	providerName: string
	imageUrl?: string
}) {
  return await db.transaction(async (trx) => {
    const userId = (
			await trx
			  .insert(schema.user)
			  .values({
			    email,
			    username,
			    name,
			  })
			  .returning({ id: schema.user.id })
		)?.[0]?.id!
    await trx.insert(schema.connection).values({
      providerId,
      providerName,
      userId,
    })
    if (imageUrl) {
      const file = await downloadFile(imageUrl)
      await trx.insert(schema.userImage).values({
        ...file,
        userId,
      })
    }

    const roleId = (
      await trx
        .select({ id: schema.role.id })
        .from(schema.role)
        .where(eq(schema.role.name, 'user'))
    )?.[0]?.id
    if (!roleId) {
      console.error('No user role found, cannot create user')
      trx.rollback()
      throw new Error('Cannot create user')
    }

    await trx.insert(schema.roleToUser).values({
      roleId,
      userId,
    })
    const [session] = await trx
      .insert(schema.session)
      .values({
        expiresAt: getSessionExpirationDate(),
        userId,
      })
      .returning({ id: schema.session.id, expiresAt: schema.session.expiresAt })

    return session!
  })
}

export async function logout(
  {
    request,
    redirectTo = '/',
  }: {
		request: Request
		redirectTo?: string
	},
  responseInit?: ResponseInit,
) {
  const authSession = await authSessionStorage.getSession(
    request.headers.get('cookie'),
  )
  const sessionId = authSession.get(sessionKey)
  // if this fails, we still need to delete the session from the user's browser
  // and it doesn't do any harm staying in the db anyway.
  if (sessionId) {
    await db
      .delete(schema.session)
      .where(eq(schema.session.id, sessionId))
      .catch((_error) => {
        console.error('Error deleting sessions')
      })
  }

  throw redirect(safeRedirect(redirectTo), {
    ...responseInit,
    headers: combineHeaders(
      { 'set-cookie': await authSessionStorage.destroySession(authSession) },
      responseInit?.headers,
    ),
  })
}

export async function getPasswordHash(password: string) {
  const hash = await bcrypt.hash(password, 10)
  return hash
}

export async function verifyUserPassword(
  byFields: { id?: string; username?: string },
  password: string,
) {
  const conditionId = byFields?.id ? eq(schema.user.id, byFields.id) : undefined
  const conditionUsername = byFields?.username
    ? eq(schema.user.username, byFields.username)
    : undefined

  const condition =
		conditionId && conditionUsername
		  ? and(conditionId, conditionUsername)
		  : conditionId
		    ? conditionId
		    : conditionUsername
  if (!condition) {
    throw new Error('No ByFields condition is given')
  }

  const userWithPassword = await db.query.user.findFirst({
    columns: {
      id: true,
    },
    where: condition,
    with: {
      password: {
        columns: {
          hash: true,
        },
      },
    },
  })

  if (!userWithPassword || !userWithPassword.password) {
    return null
  }

  const isValid = await bcrypt.compare(password, userWithPassword.password.hash)

  if (!isValid) {
    return null
  }

  return { id: userWithPassword.id }
}
