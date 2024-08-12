import { redirect, type LoaderFunctionArgs } from '@remix-run/node'
import { eq } from 'drizzle-orm'
import { requireUserId, logout } from '#app/utils/auth.server.ts'
import { db, schema } from '../db.server'

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request)
  const user = (
    await db
      .select({
        username: schema.user.username,
      })
      .from(schema.user)
      .where(eq(schema.user.id, userId))
      .limit(1)
  )?.[0]
  if (!user) {
    const requestUrl = new URL(request.url)
    const loginParams = new URLSearchParams([
      ['redirectTo', `${requestUrl.pathname}${requestUrl.search}`],
    ])
    const redirectTo = `/login?${loginParams}`
    await logout({ request, redirectTo })
    return redirect(redirectTo)
  }
  return redirect(`/users/${user.username}`)
}
