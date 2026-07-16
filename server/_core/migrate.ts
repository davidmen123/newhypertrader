import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

export async function runMigrations(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.log("[Migration] Skipping: DATABASE_URL not set");
    return;
  }

  try {
    const pool = postgres(process.env.DATABASE_URL, { max: 1 });
    const db = drizzle(pool);

    const tablesResult = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
    const tablesArray = tablesResult as unknown as Array<{ table_name: string }>;
    const existingTables = new Set(tablesArray.map(row => row.table_name));

    if (!existingTables.has('visitor_logs')) {
      console.log("[Migration] Creating visitor_logs table...");
      await db.execute(sql`
        CREATE TYPE deviceType AS ENUM ('desktop', 'mobile', 'tablet');
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS visitor_logs (
          id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          ip varchar(45) NOT NULL,
          userAgent text,
          deviceType deviceType,
          os varchar(64),
          browser varchar(64),
          page varchar(256),
          referrer text,
          duration integer,
          city varchar(64),
          region varchar(64),
          createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log("[Migration] visitor_logs table created successfully");
    } else {
      console.log("[Migration] visitor_logs table already exists");
      const columnsResult = await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name = 'visitor_logs'`);
      const columnsArray = columnsResult as unknown as Array<{ column_name: string }>;
      const existingColumns = new Set(columnsArray.map(row => row.column_name));
      
      if (!existingColumns.has('city')) {
        await db.execute(sql`ALTER TABLE visitor_logs ADD COLUMN city varchar(64)`);
        console.log("[Migration] Column city added successfully");
      }
      if (!existingColumns.has('region')) {
        await db.execute(sql`ALTER TABLE visitor_logs ADD COLUMN region varchar(64)`);
        console.log("[Migration] Column region added successfully");
      }
    }

    if (!existingTables.has('users')) {
      console.log("[Migration] Creating users table...");
      await db.execute(sql`
        CREATE TYPE role AS ENUM ('user', 'admin');
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS users (
          id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          openId varchar(64) NOT NULL UNIQUE,
          name text,
          email varchar(320),
          loginMethod varchar(64),
          role role NOT NULL DEFAULT 'user',
          createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          lastSignedIn timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log("[Migration] users table created successfully");
    }

    if (!existingTables.has('trades')) {
      console.log("[Migration] Creating trades table...");
      await db.execute(sql`
        CREATE TYPE direction AS ENUM ('buy', 'sell');
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS trades (
          id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          tradeId varchar(64) NOT NULL UNIQUE,
          orderId varchar(64),
          instrument varchar(128) NOT NULL,
          currency varchar(16) NOT NULL,
          direction direction NOT NULL,
          amount decimal(20,8) NOT NULL,
          price decimal(20,8) NOT NULL,
          fee decimal(20,8),
          feeCurrency varchar(16),
          indexPrice decimal(20,8),
          markPrice decimal(20,8),
          profit decimal(20,8),
          tradeSeq bigint,
          state varchar(32),
          label varchar(128),
          tradeTimestamp bigint NOT NULL,
          createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log("[Migration] trades table created successfully");
    }

    if (!existingTables.has('pnl_snapshots')) {
      console.log("[Migration] Creating pnl_snapshots table...");
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS pnl_snapshots (
          id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          currency varchar(16) NOT NULL,
          date varchar(16) NOT NULL,
          equity decimal(20,8) NOT NULL,
          balance decimal(20,8) NOT NULL,
          unrealizedPnl decimal(20,8),
          sessionPnl decimal(20,8),
          totalPnl decimal(20,8),
          btcPrice decimal(20,2),
          deltaTotal decimal(20,8),
          optionsTheta decimal(20,8),
          optionsVega decimal(20,8),
          optionsGamma decimal(20,8),
          snapshotAt bigint NOT NULL,
          createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (currency, date)
        );
      `);
      console.log("[Migration] pnl_snapshots table created successfully");
    }

    if (!existingTables.has('page_views')) {
      console.log("[Migration] Creating page_views table...");
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS page_views (
          id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          count bigint NOT NULL DEFAULT 0,
          updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
      console.log("[Migration] page_views table created successfully");
    }

    await pool.end();
    console.log("[Migration] All migrations completed");
  } catch (error) {
    console.error("[Migration] Failed to run migrations:", error);
  }
}