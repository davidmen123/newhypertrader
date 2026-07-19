import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// All DDL below uses unquoted identifiers on purpose: PostgreSQL folds them
// to lowercase, and drizzle/schema.ts declares the same lowercase column
// names. Do not quote camelCase identifiers here — the two sides would stop
// matching.
export async function runMigrations(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.log("[Migration] Skipping: DATABASE_URL not set");
    return;
  }

  const pool = postgres(process.env.DATABASE_URL, { max: 1 });
  const db = drizzle(pool);

  // CREATE TYPE has no IF NOT EXISTS in PostgreSQL; swallow duplicates via
  // exception handling instead.
  const createEnum = async (name: string, values: string[]) => {
    const literals = values.map((v) => `'${v}'`).join(", ");
    try {
      await db.execute(sql.raw(
        `DO $$ BEGIN CREATE TYPE ${name} AS ENUM (${literals}); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`
      ));
      console.log(`[Migration] enum ${name} created/verified`);
    } catch (error) {
      console.error(`[Migration] enum ${name} failed:`, error);
    }
  };

  const createTable = async (name: string, ddl: string) => {
    try {
      await db.execute(sql.raw(ddl));
      console.log(`[Migration] ${name} table created/verified`);
    } catch (error) {
      console.error(`[Migration] ${name} table failed:`, error);
    }
  };

  try {
    console.log("[Migration] Starting database migrations...");

    await createEnum("role", ["user", "admin"]);
    await createEnum("direction", ["buy", "sell"]);

    await createTable("visitor_logs", `
      CREATE TABLE IF NOT EXISTS visitor_logs (
        id SERIAL PRIMARY KEY,
        ip varchar(45) NOT NULL,
        userAgent text,
        deviceType varchar(16),
        os varchar(64),
        browser varchar(64),
        page varchar(256),
        referrer text,
        duration integer,
        city varchar(64),
        region varchar(64),
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await createTable("users", `
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        openId varchar(64) NOT NULL UNIQUE,
        name text,
        email varchar(320),
        loginMethod varchar(64),
        role role NOT NULL DEFAULT 'user',
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        lastSignedIn timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await createTable("trades", `
      CREATE TABLE IF NOT EXISTS trades (
        id SERIAL PRIMARY KEY,
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
      )
    `);

    await createTable("pnl_snapshots", `
      CREATE TABLE IF NOT EXISTS pnl_snapshots (
        id SERIAL PRIMARY KEY,
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
      )
    `);

    await createTable("page_views", `
      CREATE TABLE IF NOT EXISTS page_views (
        id integer PRIMARY KEY,
        count bigint NOT NULL DEFAULT 0,
        updatedAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await createTable("feedback", `
      CREATE TABLE IF NOT EXISTS feedback (
        id SERIAL PRIMARY KEY,
        content text NOT NULL,
        contact varchar(200),
        page varchar(256),
        createdAt timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute(sql`ALTER TABLE visitor_logs ADD COLUMN IF NOT EXISTS city varchar(64)`).catch(() => {});
    await db.execute(sql`ALTER TABLE visitor_logs ADD COLUMN IF NOT EXISTS region varchar(64)`).catch(() => {});
    await db.execute(sql`ALTER TABLE visitor_logs ADD COLUMN IF NOT EXISTS isProxy boolean`).catch(() => {});

    console.log("[Migration] All migrations completed");
  } catch (error) {
    console.error("[Migration] Failed to run migrations:", error);
  } finally {
    await pool.end().catch(() => {});
  }
}
