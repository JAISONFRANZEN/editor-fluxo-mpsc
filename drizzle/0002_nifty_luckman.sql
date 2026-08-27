CREATE TABLE `flowCommentAttachments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`commentId` int NOT NULL,
	`storageKey` varchar(500) NOT NULL,
	`url` varchar(750) NOT NULL,
	`filename` varchar(255) NOT NULL,
	`mimeType` varchar(120) NOT NULL,
	`size` int NOT NULL,
	`authorId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `flowCommentAttachments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','revisor','aprovador','admin') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `flowCommentAttachments` ADD CONSTRAINT `flowCommentAttachments_commentId_flowComments_id_fk` FOREIGN KEY (`commentId`) REFERENCES `flowComments`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `flowCommentAttachments` ADD CONSTRAINT `flowCommentAttachments_authorId_users_id_fk` FOREIGN KEY (`authorId`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;