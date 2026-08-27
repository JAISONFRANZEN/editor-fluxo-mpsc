CREATE TABLE `flowComments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`flowId` int NOT NULL,
	`elementId` varchar(128),
	`content` text NOT NULL,
	`status` enum('open','resolved') NOT NULL DEFAULT 'open',
	`authorId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`resolvedAt` timestamp,
	CONSTRAINT `flowComments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `flowVersions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`flowId` int NOT NULL,
	`versionNumber` int NOT NULL,
	`status` enum('draft','under_review','approved','archived') NOT NULL DEFAULT 'draft',
	`changeSummary` text NOT NULL,
	`snapshot` json NOT NULL,
	`authorId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `flowVersions_id` PRIMARY KEY(`id`),
	CONSTRAINT `flow_versions_flow_version_idx` UNIQUE(`flowId`,`versionNumber`)
);
--> statement-breakpoint
CREATE TABLE `protocolFlows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`status` enum('draft','under_review','approved','archived') NOT NULL DEFAULT 'draft',
	`currentVersion` int NOT NULL DEFAULT 1,
	`modelJson` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `protocolFlows_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `flowComments` ADD CONSTRAINT `flowComments_flowId_protocolFlows_id_fk` FOREIGN KEY (`flowId`) REFERENCES `protocolFlows`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `flowComments` ADD CONSTRAINT `flowComments_authorId_users_id_fk` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `flowVersions` ADD CONSTRAINT `flowVersions_flowId_protocolFlows_id_fk` FOREIGN KEY (`flowId`) REFERENCES `protocolFlows`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `flowVersions` ADD CONSTRAINT `flowVersions_authorId_users_id_fk` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `protocolFlows` ADD CONSTRAINT `protocolFlows_ownerId_users_id_fk` FOREIGN KEY (`ownerId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;