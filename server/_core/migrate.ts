import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { createPool } from "mysql2/promise";

export async function runMigrations(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.log("[Migration] Skipping: DATABASE_URL not set");
    return;
  }

  try {
    const pool = createPool({
      uri: process.env.DATABASE_URL,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
    const db = drizzle(pool);

    const visitorLogsTableExists = await db.execute(sql`SHOW TABLES LIKE 'visitor_logs'`);
    const resultArray = visitorLogsTableExists as unknown as Array<unknown>;
    const resultSet = resultArray[0] as { affectedRows?: number; length?: number };

    if (!resultSet || resultSet.length === 0) {
      console.log("[Migration] Creating visitor_logs table...");
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS visitor_logs (
          id int NOT NULL AUTO_INCREMENT,
          ip varchar(45) NOT NULL,
          userAgent text,
          deviceType enum('desktop','mobile','tablet'),
          os varchar(64),
          browser varchar(64),
          page varchar(256),
          referrer text,
          duration int,
          city varchar(64),
          region varchar(64),
          createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id)
        )
      `);
      console.log("[Migration] visitor_logs table created successfully");
    } else {
      console.log("[Migration] visitor_logs table already exists");
      console.log("[Migration] Checking for missing columns...");
      try {
        await db.execute(sql`ALTER TABLE visitor_logs ADD COLUMN IF NOT EXISTS city varchar(64)`);
        await db.execute(sql`ALTER TABLE visitor_logs ADD COLUMN IF NOT EXISTS region varchar(64)`);
        console.log("[Migration] Columns city and region added successfully");
      } catch (colError) {
        console.log("[Migration] Columns may already exist, skipping...");
      }
    }
  } catch (error) {
    console.error("[Migration] Failed to run migrations:", error);
  }
}