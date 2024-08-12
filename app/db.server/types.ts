import { type BuildQueryResult, type ExtractTablesWithRelations } from 'drizzle-orm'
import { type schema } from '.'

type Schema = typeof schema
type TSchema = ExtractTablesWithRelations<Schema>

export type InferResultType<TableName extends keyof TSchema> = BuildQueryResult<
	TSchema,
	TSchema[TableName],
	Record<string, unknown>
>
