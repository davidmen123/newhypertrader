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

    console.log("[Migration] Starting database migrations...");

    try {
      await db.execute(sql`CREATE TYPE IF NOT EXISTS deviceType AS ENUM ('desktop', 'mobile', 'tablet')`);
      console.log("[Migration] deviceType enum created/verified");
    } catch (e) {
      console.log("[Migration] deviceType enum may already exist, skipping");
    }

    try {
      await db.execute(sql`CREATE TYPE IF NOT EXISTS role AS ENUM ('user', 'admin')`);
      console.log("[Migration] role enum created/verified");
    } catch (e) {
      console.log("[Migration] role enum may already exist, skipping");
    }

    try {
      await db.execute(sql`CREATE TYPE IF NOT EXISTS direction AS ENUM ('buy', 'sell')`);
      console.log("[Migration] direction enum created/verified");
    } catch (e) {
      console.log("[Migration] direction enum may already exist, skipping");
    }

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
    console.log("[Migration] visitor_logs table created/verified");

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
    console.log("[Migration] users table created/verified");

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
    console.log("[Migration] trades table created/verified");

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
    console.log("[Migration] pnl_snapshots table created/verified");

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS page_views (
        id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        count bigint NOT NULL DEFAULT 0,
        updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("[Migration] page_views table created/verified");

    await db.execute(sql`ALTER TABLE visitor_logs ADD COLUMN IF NOT EXISTS city varchar(64)`);
    await db.execute(sql`ALTER TABLE visitor_logs ADD COLUMN IF NOT EXISTS region varchar(64)`);
    console.log("[Migration] visitor_logs columns checked");

    await pool.end();
    console.log("[Migration] All migrations completed successfully");
  } catch (error) {
    console.error("[Migration] Failed to run migrations:", error);
  }
}