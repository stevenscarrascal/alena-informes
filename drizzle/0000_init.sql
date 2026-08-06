CREATE TABLE `activity_log` (
	`id` char(36) NOT NULL,
	`user_id` char(36),
	`area_id` char(36),
	`report_id` char(36),
	`action` varchar(60) NOT NULL,
	`detail` varchar(500),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `activity_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `area_members` (
	`id` char(36) NOT NULL,
	`area_id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`is_lead` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `area_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `area_members_area_user_uniq` UNIQUE(`area_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `areas` (
	`id` char(36) NOT NULL,
	`name` varchar(60) NOT NULL,
	`slug` varchar(64) NOT NULL,
	`description` varchar(300),
	`icon` varchar(40) NOT NULL DEFAULT 'Folder',
	`color` varchar(20) NOT NULL DEFAULT '#1e40af',
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `areas_id` PRIMARY KEY(`id`),
	CONSTRAINT `areas_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `auth_tokens` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`type` enum('invite','recovery') NOT NULL,
	`token_hash` char(64) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`used_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auth_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `auth_tokens_token_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `permission_settings` (
	`id` char(36) NOT NULL,
	`role` enum('lider','empleado') NOT NULL,
	`area_id` char(36),
	`capability` varchar(40) NOT NULL,
	`allowed` boolean NOT NULL DEFAULT false,
	`area_key` char(36) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `permission_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `permission_settings_uniq` UNIQUE(`role`,`capability`,`area_key`)
);
--> statement-breakpoint
CREATE TABLE `report_versions` (
	`id` char(36) NOT NULL,
	`report_id` char(36) NOT NULL,
	`version` varchar(20) NOT NULL,
	`version_number` int NOT NULL DEFAULT 1,
	`entry_path` varchar(300) NOT NULL,
	`html_pages` json NOT NULL,
	`storage_prefix` varchar(200) NOT NULL,
	`size_bytes` bigint NOT NULL DEFAULT 0,
	`file_count` int NOT NULL DEFAULT 1,
	`uploaded_by` char(36) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `report_versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `report_versions_number_uniq` UNIQUE(`report_id`,`version_number`)
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` char(36) NOT NULL,
	`title` varchar(140) NOT NULL,
	`description` text,
	`area_id` char(36) NOT NULL,
	`status` enum('nuevo','en_revision','revisado') NOT NULL DEFAULT 'nuevo',
	`author_id` char(36) NOT NULL,
	`reference_code` varchar(60),
	`current_version_id` char(36),
	`view_count` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `reports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`token_hash` char(64) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`last_used_at` timestamp NOT NULL DEFAULT (now()),
	`user_agent` varchar(255),
	`ip` varchar(45),
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `sessions_token_hash_unique` UNIQUE(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `user_roles` (
	`id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`role` enum('admin','empleado') NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_roles_user_role_uniq` UNIQUE(`user_id`,`role`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` char(36) NOT NULL,
	`email` varchar(255) NOT NULL,
	`password_hash` varchar(255),
	`full_name` varchar(120) NOT NULL DEFAULT '',
	`job_title` varchar(120),
	`avatar_url` text,
	`email_verified_at` timestamp,
	`last_sign_in_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `view_tokens` (
	`token` char(64) NOT NULL,
	`version_id` char(36) NOT NULL,
	`user_id` char(36) NOT NULL,
	`expires_at` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `view_tokens_token` PRIMARY KEY(`token`)
);
--> statement-breakpoint
ALTER TABLE `activity_log` ADD CONSTRAINT `activity_log_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `activity_log` ADD CONSTRAINT `activity_log_area_id_areas_id_fk` FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `activity_log` ADD CONSTRAINT `activity_log_report_id_reports_id_fk` FOREIGN KEY (`report_id`) REFERENCES `reports`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `area_members` ADD CONSTRAINT `area_members_area_id_areas_id_fk` FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `area_members` ADD CONSTRAINT `area_members_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `auth_tokens` ADD CONSTRAINT `auth_tokens_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `permission_settings` ADD CONSTRAINT `permission_settings_area_id_areas_id_fk` FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `report_versions` ADD CONSTRAINT `report_versions_report_id_reports_id_fk` FOREIGN KEY (`report_id`) REFERENCES `reports`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `report_versions` ADD CONSTRAINT `report_versions_uploaded_by_users_id_fk` FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reports` ADD CONSTRAINT `reports_area_id_areas_id_fk` FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reports` ADD CONSTRAINT `reports_author_id_users_id_fk` FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `view_tokens` ADD CONSTRAINT `view_tokens_version_id_report_versions_id_fk` FOREIGN KEY (`version_id`) REFERENCES `report_versions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `view_tokens` ADD CONSTRAINT `view_tokens_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `idx_activity_created` ON `activity_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_auth_tokens_user` ON `auth_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_versions_report` ON `report_versions` (`report_id`);--> statement-breakpoint
CREATE INDEX `idx_reports_area` ON `reports` (`area_id`);--> statement-breakpoint
CREATE INDEX `idx_sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_view_tokens_expires` ON `view_tokens` (`expires_at`);