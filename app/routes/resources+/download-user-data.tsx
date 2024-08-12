import { json, type LoaderFunctionArgs } from '@remix-run/node'
import { eq } from 'drizzle-orm'
import { db, schema } from '#app/db.server'
import { requireUserId } from '#app/utils/auth.server.ts'
import { getDomainUrl } from '#app/utils/misc.tsx'

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request)
  const user = await db.query.user.findFirst({
    where: eq(schema.user.id, userId),
    // this is one of the *few* instances where you can use "with" because
    // the goal is to literally get *everything*. Normally you should be
    // explicit with "select". We're using select for images because we don't
    // want to send back the entire blob of the image. We'll send a URL they can
    // use to download it instead.
    with: {
      image: {
        columns: {
          id: true,
          createdAt: true,
          updatedAt: true,
          contentType: true,
        },
      },
      notes: {
        with: {
          images: {
            columns: {
              id: true,
              createdAt: true,
              updatedAt: true,
              contentType: true,
            },
          },
        },
      },
      sessions: true,
      roles: true,
    },
  })
  if (!user) throw new Error('No user found')

  const domain = getDomainUrl(request)

  return json({
    user: {
      ...user,
      image: user.image
        ? {
          ...user.image,
          url: `${domain}/resources/user-images/${user.image.id}`,
        }
        : null,
      notes: user.notes.map((note) => ({
        ...note,
        images: note.images.map((image) => ({
          ...image,
          url: `${domain}/resources/note-images/${image.id}`,
        })),
      })),
    },
  })
}
