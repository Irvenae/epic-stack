import { json } from '@remix-run/node'
import { and, eq, inArray } from 'drizzle-orm'
import { db, schema } from '#app/db.server'
import { requireUserId } from './auth.server.ts'
import { type PermissionString, parsePermissionString } from './user.ts'

export async function requireUserWithPermission(
  request: Request,
  permission: PermissionString,
) {
  const userId = await requireUserId(request)
  const permissionData = parsePermissionString(permission)
  const permissionCondition = and(
    ...[
      eq(schema.permission.action, permissionData.action),
      eq(schema.permission.entity, permissionData.entity),
      permissionData.access
        ? inArray(schema.permission.access, permissionData.access)
        : undefined,
    ].filter((val) => val !== undefined),
  )

  const user = await db.query.user.findFirst({
    columns: { id: true },
    where: and(
      eq(schema.user.id, userId),
      inArray(
        schema.user.id,
        db
          .select({ id: schema.roleToUser.userId })
          .from(schema.roleToUser)
          .where(
            inArray(
              schema.roleToUser.roleId,
              db
                .select({ id: schema.permissionToRole.roleId })
                .from(schema.permissionToRole)
                .where(
                  inArray(
                    schema.permissionToRole.permissionId,
                    db
                      .select({ id: schema.permission.id })
                      .from(schema.permission)
                      .where(permissionCondition),
                  ),
                ),
            ),
          ),
      ),
    ),
  })
  if (!user) {
    throw json(
      {
        error: 'Unauthorized',
        requiredPermission: permissionData,
        message: `Unauthorized: required permissions: ${permission}`,
      },
      { status: 403 },
    )
  }
  return user.id
}

export async function requireUserWithRole(request: Request, name: string) {
  const userId = await requireUserId(request)

  const user = await db.query.user.findFirst({
    columns: { id: true },
    where: and(
      eq(schema.user.id, userId),
      inArray(
        schema.user.id,
        db
          .select({ id: schema.roleToUser.userId })
          .from(schema.roleToUser)
          .where(
            inArray(
              schema.roleToUser.roleId,
              db
                .select({ id: schema.role.id })
                .from(schema.role)
                .where(eq(schema.role.name, name)),
            ),
          ),
      ),
    ),
  })
  if (!user) {
    throw json(
      {
        error: 'Unauthorized',
        requiredRole: name,
        message: `Unauthorized: required role: ${name}`,
      },
      { status: 403 },
    )
  }
  return user.id
}
