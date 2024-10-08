import { json, redirect, type LoaderFunctionArgs } from '@remix-run/node'
import { Link, useLoaderData } from '@remix-run/react'
import { desc, like, eq, or } from 'drizzle-orm'
import { z } from 'zod'
import { GeneralErrorBoundary } from '#app/components/error-boundary.tsx'
import { ErrorList } from '#app/components/forms.tsx'
import { SearchBar } from '#app/components/search-bar.tsx'
import { db, schema } from '#app/db.server'
import { cn, getUserImgSrc, useDelayedIsPending } from '#app/utils/misc.tsx'

const UserSearchResultSchema = z.object({
  id: z.string(),
  username: z.string(),
  name: z.string().nullable(),
  imageId: z.string().nullable(),
})

const UserSearchResultsSchema = z.array(UserSearchResultSchema)

export async function loader({ request }: LoaderFunctionArgs) {
  const searchTerm = new URL(request.url).searchParams.get('search')
  if (searchTerm === '') {
    return redirect('/users')
  }

  const sqlSearchTerm = `%${searchTerm ?? ''}%`

  const rawUsers = await db
    .select({
      id: schema.user.id,
      username: schema.user.username,
      name: schema.user.name,
      imageId: schema.userImage.id,
    })
    .from(schema.user)
    .leftJoin(schema.userImage, eq(schema.user.id, schema.userImage.userId))
    .where(
      or(
        like(schema.user.username, sqlSearchTerm),
        like(schema.user.name, sqlSearchTerm),
      ),
    )
    .orderBy(
      desc(
        db
          .select({ updatedAt: schema.note.updatedAt })
          .from(schema.note)
          .where(eq(schema.note.ownerId, schema.user.id))
          .orderBy(desc(schema.note.updatedAt))
          .limit(1),
      ),
    )
    .limit(50)

  const result = UserSearchResultsSchema.safeParse(rawUsers)
  if (!result.success) {
    return json({ status: 'error', error: result.error.message } as const, {
      status: 400,
    })
  }
  return json({ status: 'idle', users: result.data } as const)
}

export default function UsersRoute() {
  const data = useLoaderData<typeof loader>()
  const isPending = useDelayedIsPending({
    formMethod: 'GET',
    formAction: '/users',
  })

  if (data.status === 'error') {
    console.error(data.error)
  }

  return (
    <div className="container mb-48 mt-36 flex flex-col items-center justify-center gap-6">
      <h1 className="text-h1">Epic Notes Users</h1>
      <div className="w-full max-w-[700px]">
        <SearchBar status={data.status} autoFocus autoSubmit />
      </div>
      <main>
        {data.status === 'idle' ? (
          data.users.length ? (
            <ul
              className={cn(
                'flex w-full flex-wrap items-center justify-center gap-4 delay-200',
                { 'opacity-50': isPending },
              )}
            >
              {data.users.map((user) => (
                <li key={user.id}>
                  <Link
                    to={user.username}
                    className="flex h-36 w-44 flex-col items-center justify-center rounded-lg bg-muted px-5 py-3"
                  >
                    <img
                      alt={user.name ?? user.username}
                      src={getUserImgSrc(user.imageId)}
                      className="h-16 w-16 rounded-full"
                    />
                    {user.name ? (
                      <span className="w-full overflow-hidden text-ellipsis whitespace-nowrap text-center text-body-md">
                        {user.name}
                      </span>
                    ) : null}
                    <span className="w-full overflow-hidden text-ellipsis text-center text-body-sm text-muted-foreground">
                      {user.username}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p>No users found</p>
          )
        ) : data.status === 'error' ? (
          <ErrorList errors={['There was an error parsing the results']} />
        ) : null}
      </main>
    </div>
  )
}

export function ErrorBoundary() {
  return <GeneralErrorBoundary />
}
