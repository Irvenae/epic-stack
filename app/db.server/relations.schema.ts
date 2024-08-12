import { relations } from 'drizzle-orm'
import { sqliteTable, text, unique } from 'drizzle-orm/sqlite-core'
import {
  connection,
  note,
  noteImage,
  password,
  permission,
  role,
  session,
  user,
  userImage,
} from './items.schema'

export const permissionToRole = sqliteTable(
  'permission_role_junction',
  {
    permissionId: text('permission_id')
      .notNull()
      .references(() => permission.id, { onDelete: 'cascade' }),
    roleId: text('role_id')
      .notNull()
      .references(() => role.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    uniquePermissionToRoleConstraint: unique(
      'unique_permission_to_role_constraint',
    ).on(table.permissionId, table.roleId),
  }),
)

export const roleToUser = sqliteTable(
  'role_user_junction',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    roleId: text('role_id')
      .notNull()
      .references(() => role.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    uniqueRoleToUserConstraint: unique('unique_role_to_user_constraint').on(
      table.userId,
      table.roleId,
    ),
  }),
)

export const userRelations = relations(user, ({ one, many }) => ({
  image: one(userImage),
  password: one(password),
  notes: many(note),
  roles: many(role),
  sessions: many(session),
  connections: many(connection),
}))

export const noteRelations = relations(note, ({ one, many }) => ({
  images: many(noteImage),
  owner: one(user, {
    fields: [note.ownerId],
    references: [user.id],
  }),
}))

export const noteImageRelations = relations(noteImage, ({ one }) => ({
  note: one(note, {
    fields: [noteImage.noteId],
    references: [note.id],
  }),
}))

export const userImageRelations = relations(userImage, ({ one }) => ({
  user: one(user, {
    fields: [userImage.userId],
    references: [user.id],
  }),
}))

export const passwordRelations = relations(password, ({ one }) => ({
  user: one(user, {
    fields: [password.userId],
    references: [user.id],
  }),
}))

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}))

export const permissionRelations = relations(permission, ({ many }) => ({
  roles: many(role),
}))

export const roleRelations = relations(role, ({ many }) => ({
  users: many(user),
  permissions: many(permission),
}))

export const connectionRelations = relations(connection, ({ one }) => ({
  user: one(user),
}))
