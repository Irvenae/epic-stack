import { sql } from 'drizzle-orm'
import {
  sqliteTable,
  text,
  integer,
  blob,
  unique,
  index,
} from 'drizzle-orm/sqlite-core'

const createdAt = integer('created_at', { mode: 'number' })
  .default(sql`CURRENT_TIMESTAMP`)
  .notNull()
const updatedAt = integer('updated_at', { mode: 'number' })
  .default(sql`CURRENT_TIMESTAMP`)
  .$onUpdate(() => sql`CURRENT_TIMESTAMP`)
  .notNull()
const randomPrimaryId = text('id')
  .primaryKey()
  .$defaultFn(() => crypto.randomUUID())

export const user = sqliteTable('user', {
  id: randomPrimaryId,
  email: text('email').unique().notNull(),
  username: text('username').unique().notNull(),
  name: text('name'),

  createdAt,
  updatedAt,
})

export const note = sqliteTable(
  'note',
  {
    id: randomPrimaryId,
    title: text('title').notNull(),
    content: text('content').notNull(),

    createdAt,
    updatedAt,

    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    ownerIdIndex: index('note_owner_id_index').on(table.ownerId),
    // This helps our order by in the user search a LOT.
    ownerIdAndUpdatedAtIndex: index('note_owner_id_updated_at_index').on(
      table.ownerId,
      table.updatedAt,
    ),
  }),
)

export const noteImage = sqliteTable(
  'note_image',
  {
    id: randomPrimaryId,
    altText: text('alt_text'),
    contentType: text('content_type').notNull(),
    blob: blob('blob', { mode: 'buffer' }).notNull(),

    createdAt,
    updatedAt,

    noteId: text('note_id')
      .notNull()
      .references(() => note.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    noteIdIndex: index('note_image_note_id_index').on(table.noteId),
  }),
)

export const userImage = sqliteTable('user_image', {
  id: randomPrimaryId,
  altText: text('alt_text'),
  contentType: text('content_type').notNull(),
  blob: blob('blob', { mode: 'buffer' }).notNull(),

  createdAt,
  updatedAt,

  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' })
    .unique(),
})

export const password = sqliteTable('password', {
  hash: text('hash').notNull(),

  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' })
    .unique(),
})

export const session = sqliteTable(
  'session',
  {
    id: randomPrimaryId,

    createdAt,
    updatedAt,
    expiresAt: integer('expires_at', { mode: 'number' }).notNull(),

    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    userIdIndex: index('session_user_id_index').on(table.userId),
  }),
)

export const permission = sqliteTable(
  'permission',
  {
    id: randomPrimaryId,
    action: text('action').notNull(), // e.g. create, read, update, delete
    entity: text('entity').notNull(), // e.g. note, user, etc.
    access: text('access').notNull(), // e.g. own or any
    description: text('description').notNull().default(''),

    createdAt,
    updatedAt,
  },
  (table) => ({
    uniquePermissionConstraint: unique('unique_permission_constraint').on(
      table.action,
      table.entity,
      table.access,
    ),
  }),
)

export const role = sqliteTable('role', {
  id: randomPrimaryId,
  name: text('name').notNull(),
  description: text('description').notNull().default(''),

  createdAt,
  updatedAt,
})

export const verification = sqliteTable(
  'verification',
  {
    id: randomPrimaryId,
    // The type of verification, e.g. "email" or "phone".
    type: text('type').notNull(),
    // The thing we're trying to verify, e.g. a user's email or phone number.
    target: text('target').notNull(),
    // The secret key used to generate the otp.
    secret: text('secret').notNull(),
    // The algorithm used to generate the otp.
    algorithm: text('algorithm').notNull(),
    // The number of digits in the otp.
    digits: integer('digits').notNull(),
    // The number of seconds the otp is valid for.
    period: integer('period').notNull(),
    // The valid characters for the otp.
    charSet: text('charSet').notNull(),

    createdAt,
    // When it's safe to delete this verification.
    expiresAt: integer('expires_at', { mode: 'number' }),
  },
  (table) => ({
    uniqueValidationConstraint: unique('unique_validation_constraint').on(
      table.target,
      table.type,
    ),
  }),
)

export const connection = sqliteTable(
  'connection',
  {
    id: randomPrimaryId,
    providerName: text('provider_name').notNull(),
    providerId: text('provider_id').notNull(),

    createdAt,
    updatedAt,

    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    uniqueProviderConstraint: unique('unique_provider_constraint').on(
      table.providerName,
      table.providerId,
    ),
  }),
)
