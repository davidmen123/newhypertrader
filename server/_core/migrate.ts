import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

export async function runMigrations(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.log("[Migration] Skipping: DATABASE_URL not set");
    return;
  }

  try {
    const db = drizzle(process.env.DATABASE_URL);

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
          createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id)
        )
      `);
      console.log("[Migration] visitor_logs table created successfully");
    } else {
      console.log("[Migration] visitor_logs table already exists");
    }
  } catch (error) {
    console.error("[Migration] Failed to run migrations:", error);
  }
}