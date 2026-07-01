import {
  bigint,
  decimal,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Deribit trade history
export const trades = mysqlTable("trades", {
  id: int("id").autoincrement().primaryKey(),
  tradeId: varchar("tradeId", { length: 64 }).notNull().unique(),
  orderId: varchar("orderId", { length: 64 }),
  instrument: varchar("instrument", { length: 128 }).notNull(),
  currency: varchar("currency", { length: 16 }).notNull(),
  direction: mysqlEnum("direction", ["buy", "sell"]).notNull(),
  amount: decimal("amount", { precision: 20, scale: 8 }).notNull(),
  price: decimal("price", { precision: 20, scale: 8 }).notNull(),
  fee: decimal("fee", { precision: 20, scale: 8 }),
  feeCurrency: varchar("feeCurrency", { length: 16 }),
  indexPrice: decimal("indexPrice", { precision: 20, scale: 8 }),
  markPrice: decimal("markPrice", { precision: 20, scale: 8 }),
  profit: decimal("profit", { precision: 20, scale: 8 }),
  tradeSeq: bigint("tradeSeq", { mode: "number" }),
  state: varchar("state", { length: 32 }),
  label: varchar("label", { length: 128 }),
  tradeTimestamp: bigint("tradeTimestamp", { mode: "number" }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Trade = typeof trades.$inferSelect;
export type InsertTrade = typeof trades.$inferInsert;

// PnL daily snapshots
export const pnlSnapshots = mysqlTable("pnl_snapshots", {
  id: int("id").autoincrement().primaryKey(),
  currency: varchar("currency", { length: 16 }).notNull(),
  date: varchar("date", { length: 16 }).notNull(), // YYYY-MM-DD
  equity: decimal("equity", { precision: 20, scale: 8 }).notNull(),
  balance: decimal("balance", { precision: 20, scale: 8 }).notNull(),
  unrealizedPnl: decimal("unrealizedPnl", { precision: 20, scale: 8 }),
  sessionPnl: decimal("sessionPnl", { precision: 20, scale: 8 }),
  totalPnl: decimal("totalPnl", { precision: 20, scale: 8 }),
  btcPrice: decimal("btcPrice", { precision: 20, scale: 2 }), // BTC/USD price at snapshot time
  // Greeks at snapshot time (from Deribit account summary)
  deltaTotal: decimal("deltaTotal", { precision: 20, scale: 8 }),     // portfolio delta (BTC)
  optionsTheta: decimal("optionsTheta", { precision: 20, scale: 8 }), // options theta (per day, in currency)
  optionsVega: decimal("optionsVega", { precision: 20, scale: 8 }),   // options vega
  optionsGamma: decimal("optionsGamma", { precision: 20, scale: 8 }), // options gamma
  snapshotAt: bigint("snapshotAt", { mode: "number" }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PnlSnapshot = typeof pnlSnapshots.$inferSelect;
export type InsertPnlSnapshot = typeof pnlSnapshots.$inferInsert;

// Page view counter
export const pageViews = mysqlTable("page_views", {
  id: int("id").autoincrement().primaryKey(),
  count: bigint("count", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type PageView = typeof pageViews.$inferSelect;