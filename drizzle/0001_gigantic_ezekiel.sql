CREATE TABLE `pnl_snapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`currency` varchar(16) NOT NULL,
	`date` varchar(16) NOT NULL,
	`equity` decimal(20,8) NOT NULL,
	`balance` decimal(20,8) NOT NULL,
	`unrealizedPnl` decimal(20,8),
	`sessionPnl` decimal(20,8),
	`totalPnl` decimal(20,8),
	`snapshotAt` bigint NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pnl_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trades` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tradeId` varchar(64) NOT NULL,
	`orderId` varchar(64),
	`instrument` varchar(128) NOT NULL,
	`currency` varchar(16) NOT NULL,
	`direction` enum('buy','sell') NOT NULL,
	`amount` decimal(20,8) NOT NULL,
	`price` decimal(20,8) NOT NULL,
	`fee` decimal(20,8),
	`feeCurrency` varchar(16),
	`indexPrice` decimal(20,8),
	`markPrice` decimal(20,8),
	`profit` decimal(20,8),
	`tradeSeq` bigint,
	`state` varchar(32),
	`label` varchar(128),
	`tradeTimestamp` bigint NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `trades_id` PRIMARY KEY(`id`),
	CONSTRAINT `trades_tradeId_unique` UNIQUE(`tradeId`)
);
