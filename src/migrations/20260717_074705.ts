import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`ingestion_tokens_scopes\` (
  	\`order\` integer NOT NULL,
  	\`parent_id\` integer NOT NULL,
  	\`value\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`ingestion_tokens\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`ingestion_tokens_scopes_order_idx\` ON \`ingestion_tokens_scopes\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`ingestion_tokens_scopes_parent_idx\` ON \`ingestion_tokens_scopes\` (\`parent_id\`);`)
  await db.run(sql`CREATE TABLE \`ingestion_tokens\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`token_hash\` text NOT NULL,
  	\`disabled\` integer DEFAULT false NOT NULL,
  	\`expires_at\` text,
  	\`last_used_at\` text,
  	\`rotated_from_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`rotated_from_id\`) REFERENCES \`ingestion_tokens\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`ingestion_tokens_token_hash_idx\` ON \`ingestion_tokens\` (\`token_hash\`);`)
  await db.run(sql`CREATE INDEX \`ingestion_tokens_disabled_idx\` ON \`ingestion_tokens\` (\`disabled\`);`)
  await db.run(sql`CREATE INDEX \`ingestion_tokens_expires_at_idx\` ON \`ingestion_tokens\` (\`expires_at\`);`)
  await db.run(sql`CREATE INDEX \`ingestion_tokens_rotated_from_idx\` ON \`ingestion_tokens\` (\`rotated_from_id\`);`)
  await db.run(sql`CREATE INDEX \`ingestion_tokens_updated_at_idx\` ON \`ingestion_tokens\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`ingestion_tokens_created_at_idx\` ON \`ingestion_tokens\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`ingestion_jobs\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`import_id\` text NOT NULL,
  	\`idempotency_key\` text NOT NULL,
  	\`actor_token_id\` integer NOT NULL,
  	\`status\` text DEFAULT 'needs-review' NOT NULL,
  	\`competition_slug\` text NOT NULL,
  	\`paper_code\` text NOT NULL,
  	\`problem_code\` text NOT NULL,
  	\`content_hash\` text NOT NULL,
  	\`source_bundle\` text NOT NULL,
  	\`raw_input\` text NOT NULL,
  	\`normalized_input\` text NOT NULL,
  	\`validation\` text NOT NULL,
  	\`revision_of_id\` integer,
  	\`created_problem_id\` integer,
  	\`audit_trail\` text DEFAULT '[]' NOT NULL,
  	\`reject_reason\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`actor_token_id\`) REFERENCES \`ingestion_tokens\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`revision_of_id\`) REFERENCES \`ingestion_jobs\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`created_problem_id\`) REFERENCES \`problems\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`ingestion_jobs_import_id_idx\` ON \`ingestion_jobs\` (\`import_id\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`ingestion_jobs_idempotency_key_idx\` ON \`ingestion_jobs\` (\`idempotency_key\`);`)
  await db.run(sql`CREATE INDEX \`ingestion_jobs_actor_token_idx\` ON \`ingestion_jobs\` (\`actor_token_id\`);`)
  await db.run(sql`CREATE INDEX \`ingestion_jobs_status_idx\` ON \`ingestion_jobs\` (\`status\`);`)
  await db.run(sql`CREATE INDEX \`ingestion_jobs_competition_slug_idx\` ON \`ingestion_jobs\` (\`competition_slug\`);`)
  await db.run(sql`CREATE INDEX \`ingestion_jobs_paper_code_idx\` ON \`ingestion_jobs\` (\`paper_code\`);`)
  await db.run(sql`CREATE INDEX \`ingestion_jobs_problem_code_idx\` ON \`ingestion_jobs\` (\`problem_code\`);`)
  await db.run(sql`CREATE INDEX \`ingestion_jobs_content_hash_idx\` ON \`ingestion_jobs\` (\`content_hash\`);`)
  await db.run(sql`CREATE INDEX \`ingestion_jobs_revision_of_idx\` ON \`ingestion_jobs\` (\`revision_of_id\`);`)
  await db.run(sql`CREATE INDEX \`ingestion_jobs_created_problem_idx\` ON \`ingestion_jobs\` (\`created_problem_id\`);`)
  await db.run(sql`CREATE INDEX \`ingestion_jobs_updated_at_idx\` ON \`ingestion_jobs\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`ingestion_jobs_created_at_idx\` ON \`ingestion_jobs\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`ingestion_items\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`job_id\` integer NOT NULL,
  	\`identity_key\` text NOT NULL,
  	\`content_hash\` text NOT NULL,
  	\`data\` text NOT NULL,
  	\`field_assessments\` text NOT NULL,
  	\`validation\` text NOT NULL,
  	\`review_state\` text DEFAULT 'needs-review' NOT NULL,
  	\`revision_of_id\` integer,
  	\`created_problem_id\` integer,
  	\`human_diff\` text,
  	\`reviewed_by_id\` integer,
  	\`reviewed_at\` text,
  	\`audit_trail\` text DEFAULT '[]' NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`job_id\`) REFERENCES \`ingestion_jobs\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`revision_of_id\`) REFERENCES \`ingestion_items\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`created_problem_id\`) REFERENCES \`problems\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`reviewed_by_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`ingestion_items_job_idx\` ON \`ingestion_items\` (\`job_id\`);`)
  await db.run(sql`CREATE INDEX \`ingestion_items_identity_key_idx\` ON \`ingestion_items\` (\`identity_key\`);`)
  await db.run(sql`CREATE INDEX \`ingestion_items_content_hash_idx\` ON \`ingestion_items\` (\`content_hash\`);`)
  await db.run(sql`CREATE INDEX \`ingestion_items_review_state_idx\` ON \`ingestion_items\` (\`review_state\`);`)
  await db.run(sql`CREATE INDEX \`ingestion_items_revision_of_idx\` ON \`ingestion_items\` (\`revision_of_id\`);`)
  await db.run(sql`CREATE INDEX \`ingestion_items_created_problem_idx\` ON \`ingestion_items\` (\`created_problem_id\`);`)
  await db.run(sql`CREATE INDEX \`ingestion_items_reviewed_by_idx\` ON \`ingestion_items\` (\`reviewed_by_id\`);`)
  await db.run(sql`CREATE INDEX \`ingestion_items_updated_at_idx\` ON \`ingestion_items\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`ingestion_items_created_at_idx\` ON \`ingestion_items\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`ingestion_assets\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`item_id\` integer NOT NULL,
  	\`asset_key\` text NOT NULL,
  	\`metadata\` text NOT NULL,
  	\`r2_object_key\` text,
  	\`content_hash\` text,
  	\`media_type\` text,
  	\`original_file_name\` text,
  	\`byte_size\` numeric,
  	\`status\` text DEFAULT 'unreviewed' NOT NULL,
  	\`created_media_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`item_id\`) REFERENCES \`ingestion_items\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`created_media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`ingestion_assets_item_idx\` ON \`ingestion_assets\` (\`item_id\`);`)
  await db.run(sql`CREATE INDEX \`ingestion_assets_asset_key_idx\` ON \`ingestion_assets\` (\`asset_key\`);`)
  await db.run(sql`CREATE INDEX \`ingestion_assets_r2_object_key_idx\` ON \`ingestion_assets\` (\`r2_object_key\`);`)
  await db.run(sql`CREATE INDEX \`ingestion_assets_content_hash_idx\` ON \`ingestion_assets\` (\`content_hash\`);`)
  await db.run(sql`CREATE INDEX \`ingestion_assets_status_idx\` ON \`ingestion_assets\` (\`status\`);`)
  await db.run(sql`CREATE INDEX \`ingestion_assets_created_media_idx\` ON \`ingestion_assets\` (\`created_media_id\`);`)
  await db.run(sql`CREATE INDEX \`ingestion_assets_updated_at_idx\` ON \`ingestion_assets\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`ingestion_assets_created_at_idx\` ON \`ingestion_assets\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`item_assetKey_idx\` ON \`ingestion_assets\` (\`item_id\`,\`asset_key\`);`)
  await db.run(sql`ALTER TABLE \`competitions\` ADD \`name_original\` text;`)
  await db.run(sql`ALTER TABLE \`competitions\` ADD \`edition_label\` text;`)
  await db.run(sql`ALTER TABLE \`problems\` ADD \`paper_code\` text;`)
  await db.run(sql`ALTER TABLE \`problems\` ADD \`problem_code\` text;`)
  await db.run(sql`ALTER TABLE \`problems\` ADD \`source_pages\` text;`)
  await db.run(sql`ALTER TABLE \`problems\` ADD \`ingestion_item_id\` integer REFERENCES ingestion_items(id);`)
  await db.run(sql`CREATE INDEX \`problems_paper_code_idx\` ON \`problems\` (\`paper_code\`);`)
  await db.run(sql`CREATE INDEX \`problems_problem_code_idx\` ON \`problems\` (\`problem_code\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`problems_ingestion_item_idx\` ON \`problems\` (\`ingestion_item_id\`);`)
  await db.run(sql`ALTER TABLE \`_problems_v\` ADD \`version_paper_code\` text;`)
  await db.run(sql`ALTER TABLE \`_problems_v\` ADD \`version_problem_code\` text;`)
  await db.run(sql`ALTER TABLE \`_problems_v\` ADD \`version_source_pages\` text;`)
  await db.run(sql`ALTER TABLE \`_problems_v\` ADD \`version_ingestion_item_id\` integer REFERENCES ingestion_items(id);`)
  await db.run(sql`CREATE INDEX \`_problems_v_version_version_paper_code_idx\` ON \`_problems_v\` (\`version_paper_code\`);`)
  await db.run(sql`CREATE INDEX \`_problems_v_version_version_problem_code_idx\` ON \`_problems_v\` (\`version_problem_code\`);`)
  await db.run(sql`CREATE INDEX \`_problems_v_version_version_ingestion_item_idx\` ON \`_problems_v\` (\`version_ingestion_item_id\`);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`ingestion_tokens_id\` integer REFERENCES ingestion_tokens(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`ingestion_jobs_id\` integer REFERENCES ingestion_jobs(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`ingestion_items_id\` integer REFERENCES ingestion_items(id);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`ingestion_assets_id\` integer REFERENCES ingestion_assets(id);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_ingestion_tokens_id_idx\` ON \`payload_locked_documents_rels\` (\`ingestion_tokens_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_ingestion_jobs_id_idx\` ON \`payload_locked_documents_rels\` (\`ingestion_jobs_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_ingestion_items_id_idx\` ON \`payload_locked_documents_rels\` (\`ingestion_items_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_ingestion_assets_id_idx\` ON \`payload_locked_documents_rels\` (\`ingestion_assets_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`PRAGMA foreign_keys=OFF;`)
  await db.run(sql`DROP TABLE IF EXISTS \`__new_problems\`;`)
  await db.run(sql`CREATE TABLE \`__new_problems\` (
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
  await db.run(sql`INSERT INTO \`__new_problems\`("id", "slug", "competition_id", "difficulty", "original_language", "content_original", "content_zh", "content_en", "answer_original", "answer_zh", "answer_en", "source", "official_solution_url", "allow_wiki_edit", "status", "total_likes", "total_dislikes", "avg_score", "score_count", "updated_at", "created_at") SELECT "id", "slug", "competition_id", "difficulty", "original_language", "content_original", "content_zh", "content_en", "answer_original", "answer_zh", "answer_en", "source", "official_solution_url", "allow_wiki_edit", "status", "total_likes", "total_dislikes", "avg_score", "score_count", "updated_at", "created_at" FROM \`problems\`;`)
  await db.run(sql`DROP TABLE \`problems\`;`)
  await db.run(sql`ALTER TABLE \`__new_problems\` RENAME TO \`problems\`;`)
  await db.run(sql`PRAGMA foreign_keys=ON;`)
  await db.run(sql`CREATE UNIQUE INDEX \`problems_slug_idx\` ON \`problems\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`problems_competition_idx\` ON \`problems\` (\`competition_id\`);`)
  await db.run(sql`CREATE INDEX \`problems_difficulty_idx\` ON \`problems\` (\`difficulty\`);`)
  await db.run(sql`CREATE INDEX \`problems_status_idx\` ON \`problems\` (\`status\`);`)
  await db.run(sql`CREATE INDEX \`problems_updated_at_idx\` ON \`problems\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`problems_created_at_idx\` ON \`problems\` (\`created_at\`);`)
  await db.run(sql`DROP TABLE IF EXISTS \`__new__problems_v\`;`)
  await db.run(sql`CREATE TABLE \`__new__problems_v\` (
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
  await db.run(sql`INSERT INTO \`__new__problems_v\`("id", "parent_id", "version_slug", "version_competition_id", "version_difficulty", "version_original_language", "version_content_original", "version_content_zh", "version_content_en", "version_answer_original", "version_answer_zh", "version_answer_en", "version_source", "version_official_solution_url", "version_allow_wiki_edit", "version_status", "version_total_likes", "version_total_dislikes", "version_avg_score", "version_score_count", "version_updated_at", "version_created_at", "created_at", "updated_at") SELECT "id", "parent_id", "version_slug", "version_competition_id", "version_difficulty", "version_original_language", "version_content_original", "version_content_zh", "version_content_en", "version_answer_original", "version_answer_zh", "version_answer_en", "version_source", "version_official_solution_url", "version_allow_wiki_edit", "version_status", "version_total_likes", "version_total_dislikes", "version_avg_score", "version_score_count", "version_updated_at", "version_created_at", "created_at", "updated_at" FROM \`_problems_v\`;`)
  await db.run(sql`DROP TABLE \`_problems_v\`;`)
  await db.run(sql`ALTER TABLE \`__new__problems_v\` RENAME TO \`_problems_v\`;`)
  await db.run(sql`CREATE INDEX \`_problems_v_parent_idx\` ON \`_problems_v\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_problems_v_version_version_slug_idx\` ON \`_problems_v\` (\`version_slug\`);`)
  await db.run(sql`CREATE INDEX \`_problems_v_version_version_competition_idx\` ON \`_problems_v\` (\`version_competition_id\`);`)
  await db.run(sql`CREATE INDEX \`_problems_v_version_version_difficulty_idx\` ON \`_problems_v\` (\`version_difficulty\`);`)
  await db.run(sql`CREATE INDEX \`_problems_v_version_version_status_idx\` ON \`_problems_v\` (\`version_status\`);`)
  await db.run(sql`CREATE INDEX \`_problems_v_version_version_updated_at_idx\` ON \`_problems_v\` (\`version_updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_problems_v_version_version_created_at_idx\` ON \`_problems_v\` (\`version_created_at\`);`)
  await db.run(sql`CREATE INDEX \`_problems_v_created_at_idx\` ON \`_problems_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_problems_v_updated_at_idx\` ON \`_problems_v\` (\`updated_at\`);`)
  await db.run(sql`DROP TABLE IF EXISTS \`__new_payload_locked_documents_rels\`;`)
  await db.run(sql`CREATE TABLE \`__new_payload_locked_documents_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`users_id\` integer,
  	\`media_id\` integer,
  	\`competitions_id\` integer,
  	\`problems_id\` integer,
  	\`problem_ratings_id\` integer,
  	\`problem_edits_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`competitions_id\`) REFERENCES \`competitions\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`problems_id\`) REFERENCES \`problems\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`problem_ratings_id\`) REFERENCES \`problem_ratings\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`problem_edits_id\`) REFERENCES \`problem_edits\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "users_id", "media_id", "competitions_id", "problems_id", "problem_ratings_id", "problem_edits_id") SELECT "id", "order", "parent_id", "path", "users_id", "media_id", "competitions_id", "problems_id", "problem_ratings_id", "problem_edits_id" FROM \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_users_id_idx\` ON \`payload_locked_documents_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_media_id_idx\` ON \`payload_locked_documents_rels\` (\`media_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_competitions_id_idx\` ON \`payload_locked_documents_rels\` (\`competitions_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_problems_id_idx\` ON \`payload_locked_documents_rels\` (\`problems_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_problem_ratings_id_idx\` ON \`payload_locked_documents_rels\` (\`problem_ratings_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_problem_edits_id_idx\` ON \`payload_locked_documents_rels\` (\`problem_edits_id\`);`)
  await db.run(sql`ALTER TABLE \`competitions\` DROP COLUMN \`name_original\`;`)
  await db.run(sql`ALTER TABLE \`competitions\` DROP COLUMN \`edition_label\`;`)
  await db.run(sql`DROP TABLE \`ingestion_assets\`;`)
  await db.run(sql`DROP TABLE \`ingestion_items\`;`)
  await db.run(sql`DROP TABLE \`ingestion_jobs\`;`)
  await db.run(sql`DROP TABLE \`ingestion_tokens_scopes\`;`)
  await db.run(sql`DROP TABLE \`ingestion_tokens\`;`)
}
