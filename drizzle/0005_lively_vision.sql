CREATE TABLE `visitor_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ip` varchar(45) NOT NULL,
  `userAgent` text,
  `deviceType` enum('desktop','mobile','tablet'),
  `os` varchar(64),
  `browser` varchar(64),
  `page` varchar(256),
  `referrer` text,
  `duration` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);