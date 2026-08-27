CREATE TABLE `flowAuditEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`flowId` int NOT NULL,
	`actorId` int NOT NULL,
	`action` varchar(80) NOT NULL,
	`context` json NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `flowAuditEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `flowAuditEvents` ADD CONSTRAINT `flowAuditEvents_flowId_protocolFlows_id_fk` FOREIGN KEY (`flowId`) REFERENCES `protocolFlows`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `flowAuditEvents` ADD CONSTRAINT `flowAuditEvents_actorId_users_id_fk` FOREIGN KEY (`actorId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;