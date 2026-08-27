CREATE TABLE `flowMembers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`flowId` int NOT NULL,
	`userId` int NOT NULL,
	`assignedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `flowMembers_id` PRIMARY KEY(`id`),
	CONSTRAINT `flow_members_flow_user_idx` UNIQUE(`flowId`,`userId`)
);
--> statement-breakpoint
ALTER TABLE `flowMembers` ADD CONSTRAINT `flowMembers_flowId_protocolFlows_id_fk` FOREIGN KEY (`flowId`) REFERENCES `protocolFlows`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `flowMembers` ADD CONSTRAINT `flowMembers_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `flowMembers` ADD CONSTRAINT `flowMembers_assignedBy_users_id_fk` FOREIGN KEY (`assignedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;