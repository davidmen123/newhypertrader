import {
  bigint,
  boolean,
  decimal,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["user", "admin"]);
export const directionEnum = pgEnum("direction", ["buy", "sell"]);
export const deviceTypeEnum = pgEnum("deviceType", ["desktop", "mobile", "tablet"]);

export const users = pgTable("users", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const trades = pgTable("trades", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  tradeId: varchar("tradeId", { length: 64 }).notNull().unique(),
  orderId: varchar("orderId", { length: 64 }),
  instrument: varchar("instrument", { length: 128 }).notNull(),
  currency: varchar("currency", { length: 16 }).notNull(),
  direction: directionEnum("direction").notNull(),
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

export const pnlSnapshots = pgTable("pnl_snapshots", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  currency: varchar("currency", { length: 16 }).notNull(),
  date: varchar("date", { length: 16 }).notNull(),
  equity: decimal("equity", { precision: 20, scale: 8 }).notNull(),
  balance: decimal("balance", { precision: 20, scale: 8 }).notNull(),
  unrealizedPnl: decimal("unrealizedPnl", { precision: 20, scale: 8 }),
  sessionPnl: decimal("sessionPnl", { precision: 20, scale: 8 }),
  totalPnl: decimal("totalPnl", { precision: 20, scale: 8 }),
  btcPrice: decimal("btcPrice", { precision: 20, scale: 2 }),
  deltaTotal: decimal("deltaTotal", { precision: 20, scale: 8 }),
  optionsTheta: decimal("optionsTheta", { precision: 20, scale: 8 }),
  optionsVega: decimal("optionsVega", { precision: 20, scale: 8 }),
  optionsGamma: decimal("optionsGamma", { precision: 20, scale: 8 }),
  snapshotAt: bigint("snapshotAt", { mode: "number" }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type PnlSnapshot = typeof pnlSnapshots.$inferSelect;
export type InsertPnlSnapshot = typeof pnlSnapshots.$inferInsert;

export const pageViews = pgTable("page_views", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  count: bigint("count", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type PageView = typeof pageViews.$inferSelect;

export const visitorLogs = pgTable("visitor_logs", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  ip: varchar("ip", { length: 45 }).notNull(),
  userAgent: text("userAgent"),
  deviceType: deviceTypeEnum("deviceType"),
  os: varchar("os", { length: 64 }),
  browser: varchar("browser", { length: 64 }),
  page: varchar("page", { length: 256 }),
  referrer: text("referrer"),
  duration: integer("duration"),
  city: varchar("city", { length: 64 }),
  region: varchar("region", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type VisitorLog = typeof visitorLogs.$inferSelect;
export type InsertVisitorLog = typeof visitorLogs.$inferInsert;