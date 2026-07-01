CREATE TABLE `page_views` (
	`id` int AUTO_INCREMENT NOT NULL,
	`count` bigint NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `page_views_id` PRIMARY KEY(`id`)
);
