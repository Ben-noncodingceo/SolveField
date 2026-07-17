import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`competitions\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`slug\` text NOT NULL,
  	\`name_zh\` text NOT NULL,
  	\`name_en\` text NOT NULL,
  	\`year\` numeric NOT NULL,
  	\`level\` text NOT NULL,
  	\`description_zh\` text,
  	\`description_en\` text,
  	\`cover_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`cover_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`competitions_slug_idx\` ON \`competitions\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`competitions_year_idx\` ON \`competitions\` (\`year\`);`)
  await db.run(sql`CREATE INDEX \`competitions_level_idx\` ON \`competitions\` (\`level\`);`)
  await db.run(sql`CREATE INDEX \`competitions_cover_idx\` ON \`competitions\` (\`cover_id\`);`)
  await db.run(sql`CREATE INDEX \`competitions_updated_at_idx\` ON \`competitions\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`competitions_created_at_idx\` ON \`competitions\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`problems_tags\` (
  	\`order\` integer NOT NULL,
  	\`parent_id\` integer NOT NULL,
  	\`value\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`problems\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`problems_tags_order_idx\` ON \`problems_tags\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`problems_tags_parent_idx\` ON \`problems_tags\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`problems_tags_value_idx\` ON \`problems_tags\` (\`value\`);`)
  await db.run(sql`CREATE TABLE \`problems\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`slug\` text NOT NULL,
  	\`competition_id\` integer NOT NULL,
  	\`difficulty\` numeric NOT NULL,
  	\`original_language\` text NOT NULL,
  	\`content_original\` text NOT NULL,
  	\`content_zh\` text,
  	\`content_en\` text,
  	\`answer_original\` text,
  	\`answer_zh\` text,
  	\`answer_en\` text,
  	\`source\` text NOT NULL,
  	\`official_solution_url\` text,
  	\`allow_wiki_edit\` integer DEFAULT true,
  	\`status\` text DEFAULT 'draft' NOT NULL,
  	\`total_likes\` numeric DEFAULT 0,
  	\`total_dislikes\` numeric DEFAULT 0,
  	\`avg_score\` numeric,
  	\`score_count\` numeric DEFAULT 0,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`competition_id\`) REFERENCES \`competitions\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`problems_slug_idx\` ON \`problems\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`problems_competition_idx\` ON \`problems\` (\`competition_id\`);`)
  await db.run(sql`CREATE INDEX \`problems_difficulty_idx\` ON \`problems\` (\`difficulty\`);`)
  await db.run(sql`CREATE INDEX \`problems_status_idx\` ON \`problems\` (\`status\`);`)
  await db.run(sql`CREATE INDEX \`problems_updated_at_idx\` ON \`problems\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`problems_created_at_idx\` ON \`problems\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`_problems_v_version_tags\` (
  	\`order\` integer NOT NULL,
  	\`parent_id\` integer NOT NULL,
  	\`value\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`_problems_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`_problems_v_version_tags_order_idx\` ON \`_problems_v_version_tags\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`_problems_v_version_tags_parent_idx\` ON \`_problems_v_version_tags\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_problems_v_version_tags_value_idx\` ON \`_problems_v_version_tags\` (\`value\`);`)
  await db.run(sql`CREATE TABLE \`_problems_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`parent_id\` integer,
  	\`version_slug\` text NOT NULL,
  	\`version_competition_id\` integer NOT NULL,
  	\`version_difficulty\` numeric NOT NULL,
  	\`version_original_language\` text NOT NULL,
  	\`version_content_original\` text NOT NULL,
  	\`version_content_zh\` text,
  	\`version_content_en\` text,
  	\`version_answer_original\` text,
  	\`version_answer_zh\` text,
  	\`version_answer_en\` text,
  	\`version_source\` text NOT NULL,
  	\`version_official_solution_url\` text,
  	\`version_allow_wiki_edit\` integer DEFAULT true,
  	\`version_status\` text DEFAULT 'draft' NOT NULL,
  	\`version_total_likes\` numeric DEFAULT 0,
  	\`version_total_dislikes\` numeric DEFAULT 0,
  	\`version_avg_score\` numeric,
  	\`version_score_count\` numeric DEFAULT 0,
  	\`version_updated_at\` text,
  	\`version_created_at\` text,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`problems\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_competition_id\`) REFERENCES \`competitions\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`_problems_v_parent_idx\` ON \`_problems_v\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_problems_v_version_version_slug_idx\` ON \`_problems_v\` (\`version_slug\`);`)
  await db.run(sql`CREATE INDEX \`_problems_v_version_version_competition_idx\` ON \`_problems_v\` (\`version_competition_id\`);`)
  await db.run(sql`CREATE INDEX \`_problems_v_version_version_difficulty_idx\` ON \`_problems_v\` (\`version_difficulty\`);`)
  await db.run(sql`CREATE INDEX \`_problems_v_version_version_status_idx\` ON \`_problems_v\` (\`version_status\`);`)
  await db.run(sql`CREATE INDEX \`_problems_v_version_version_updated_at_idx\` ON \`_problems_v\` (\`version_updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_problems_v_version_version_created_at_idx\` ON \`_problems_v\` (\`version_created_at\`);`)
  await db.run(sql`CREATE INDEX \`_problems_v_created_at_idx\` ON \`_problems_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_problems_v_updated_at_idx\` ON \`_problems_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE TABLE \`problem_ratings\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`problem_id\` integer NOT NULL,
  	\`user_id\` integer NOT NULL,
  	\`vote\` numeric DEFAULT 0 NOT NULL,
  	\`score\` numeric,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`problem_id\`) REFERENCES \`problems\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`problem_ratings_problem_idx\` ON \`problem_ratings\` (\`problem_id\`);`)
  await db.run(sql`CREATE INDEX \`problem_ratings_user_idx\` ON \`problem_ratings\` (\`user_id\`);`)
  await db.run(sql`CREATE INDEX \`problem_ratings_updated_at_idx\` ON \`problem_ratings\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`problem_ratings_created_at_idx\` ON \`problem_ratings\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`problem_user_idx\` ON \`problem_ratings\` (\`problem_id\`,\`user_id\`);`)
  await db.run(sql`CREATE TABLE \`problem_edits\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`target_problem_id\` integer NOT NULL,
  	\`submit_user_id\` integer NOT NULL,
  	\`edit_type\` text NOT NULL,
  	\`edit_multi_content_content_original\` text,
  	\`edit_multi_content_content_zh\` text,
  	\`edit_multi_content_content_en\` text,
  	\`edit_multi_content_answer_original\` text,
  	\`edit_multi_content_answer_zh\` text,
  	\`edit_multi_content_answer_en\` text,
  	\`remark\` text,
  	\`status\` text DEFAULT 'pending' NOT NULL,
  	\`before_snapshot\` text,
  	\`after_snapshot\` text,
  	\`reviewed_by_id\` integer,
  	\`reviewed_at\` text,
  	\`reject_reason\` text,
  	\`target_version\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`target_problem_id\`) REFERENCES \`problems\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`submit_user_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`reviewed_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`problem_edits_target_problem_idx\` ON \`problem_edits\` (\`target_problem_id\`);`)
  await db.run(sql`CREATE INDEX \`problem_edits_submit_user_idx\` ON \`problem_edits\` (\`submit_user_id\`);`)
  await db.run(sql`CREATE INDEX \`problem_edits_status_idx\` ON \`problem_edits\` (\`status\`);`)
  await db.run(sql`CREATE INDEX \`problem_edits_reviewed_by_idx\` ON \`problem_edits\` (\`reviewed_by_id\`);`)
  await db.run(sql`CREATE INDEX \`problem_edits_updated_at_idx\` ON \`problem_edits\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`problem_edits_created_at_idx\` ON \`problem_edits\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`payload_kv\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`key\` text NOT NULL,
  	\`data\` text NOT NULL
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`payload_kv_key_idx\` ON \`payload_kv\` (\`key\`);`)
  await db.run(sql`ALTER TABLE \`users\` ADD \`role\` text DEFAULT 'user' NOT NULL;`)
  await db.run(sql`CREATE INDEX \`users_role_idx\` ON \`users\` (\`role\`);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`competitions_id\` integer REFERENCES competitions(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`problems_id\` integer REFERENCES problems(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`problem_ratings_id\` integer REFERENCES problem_ratings(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`problem_edits_id\` integer REFERENCES problem_edits(id);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_competitions_id_idx\` ON \`payload_locked_documents_rels\` (\`competitions_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_problems_id_idx\` ON \`payload_locked_documents_rels\` (\`problems_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_problem_ratings_id_idx\` ON \`payload_locked_documents_rels\` (\`problem_ratings_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_problem_edits_id_idx\` ON \`payload_locked_documents_rels\` (\`problem_edits_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`competitions\`;`)
  await db.run(sql`DROP TABLE \`problems_tags\`;`)
  await db.run(sql`DROP TABLE \`problems\`;`)
  await db.run(sql`DROP TABLE \`_problems_v_version_tags\`;`)
  await db.run(sql`DROP TABLE \`_problems_v\`;`)
  await db.run(sql`DROP TABLE \`problem_ratings\`;`)
  await db.run(sql`DROP TABLE \`problem_edits\`;`)
  await db.run(sql`DROP TABLE \`payload_kv\`;`)
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`CREATE TABLE \`__new_payload_locked_documents_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`users_id\` integer,
  	\`media_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "users_id", "media_id") SELECT "id", "order", "parent_id", "path", "users_id", "media_id" FROM \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_users_id_idx\` ON \`payload_locked_documents_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_media_id_idx\` ON \`payload_locked_documents_rels\` (\`media_id\`);`)
  await db.run(sql`DROP INDEX \`users_role_idx\`;`)
  await db.run(sql`ALTER TABLE \`users\` DROP COLUMN \`role\`;`)
}
