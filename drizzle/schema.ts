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

// Column name strings are deliberately all-lowercase: the tables are created
// by unquoted raw DDL (migrate.ts / db.ts ensure), and PostgreSQL folds
// unquoted identifiers to lowercase. Drizzle quotes whatever name is declared
// here, so a camelCase name like "createdAt" would never match the real
// column. TypeScript property names stay camelCase.
export const roleEnum = pgEnum("role", ["user", "admin"]);
export const directionEnum = pgEnum("direction", ["buy", "sell"]);

export const users = pgTable("users", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  openId: varchar("openid", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginmethod", { length: 64 }),
  role: roleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdat").defaultNow().notNull(),
  updatedAt: timestamp("updatedat").defaultNow().notNull(),
  lastSignedIn: timestamp("lastsignedin").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const trades = pgTable("trades", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  tradeId: varchar("tradeid", { length: 64 }).notNull().unique(),
  orderId: varchar("orderid", { length: 64 }),
  instrument: varchar("instrument", { length: 128 }).notNull(),
  currency: varchar("currency", { length: 16 }).notNull(),
  direction: directionEnum("direction").notNull(),
  amount: decimal("amount", { precision: 20, scale: 8 }).notNull(),
  price: decimal("price", { precision: 20, scale: 8 }).notNull(),
  fee: decimal("fee", { precision: 20, scale: 8 }),
  feeCurrency: varchar("feecurrency", { length: 16 }),
  indexPrice: decimal("indexprice", { precision: 20, scale: 8 }),
  markPrice: decimal("markprice", { precision: 20, scale: 8 }),
  profit: decimal("profit", { precision: 20, scale: 8 }),
  tradeSeq: bigint("tradeseq", { mode: "number" }),
  state: varchar("state", { length: 32 }),
  label: varchar("label", { length: 128 }),
  tradeTimestamp: bigint("tradetimestamp", { mode: "number" }).notNull(),
  createdAt: timestamp("createdat").defaultNow().notNull(),
});

export type Trade = typeof trades.$inferSelect;
export type InsertTrade = typeof trades.$inferInsert;

export const pnlSnapshots = pgTable("pnl_snapshots", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  currency: varchar("currency", { length: 16 }).notNull(),
  date: varchar("date", { length: 16 }).notNull(),
  equity: decimal("equity", { precision: 20, scale: 8 }).notNull(),
  balance: decimal("balance", { precision: 20, scale: 8 }).notNull(),
  unrealizedPnl: decimal("unrealizedpnl", { precision: 20, scale: 8 }),
  sessionPnl: decimal("sessionpnl", { precision: 20, scale: 8 }),
  totalPnl: decimal("totalpnl", { precision: 20, scale: 8 }),
  btcPrice: decimal("btcprice", { precision: 20, scale: 2 }),
  deltaTotal: decimal("deltatotal", { precision: 20, scale: 8 }),
  optionsTheta: decimal("optionstheta", { precision: 20, scale: 8 }),
  optionsVega: decimal("optionsvega", { precision: 20, scale: 8 }),
  optionsGamma: decimal("optionsgamma", { precision: 20, scale: 8 }),
  snapshotAt: bigint("snapshotat", { mode: "number" }).notNull(),
  createdAt: timestamp("createdat").defaultNow().notNull(),
});

export type PnlSnapshot = typeof pnlSnapshots.$inferSelect;
export type InsertPnlSnapshot = typeof pnlSnapshots.$inferInsert;

// Plain integer PK (not identity): the app upserts the singleton row with an
// explicit id = 1, which GENERATED ALWAYS columns reject.
export const pageViews = pgTable("page_views", {
  id: integer("id").primaryKey(),
  count: bigint("count", { mode: "number" }).notNull().default(0),
  updatedAt: timestamp("updatedat").defaultNow().notNull(),
});

export type PageView = typeof pageViews.$inferSelect;

export const visitorLogs = pgTable("visitor_logs", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  ip: varchar("ip", { length: 45 }).notNull(),
  userAgent: text("useragent"),
  deviceType: varchar("devicetype", { length: 16 }),
  os: varchar("os", { length: 64 }),
  browser: varchar("browser", { length: 64 }),
  page: varchar("page", { length: 256 }),
  referrer: text("referrer"),
  duration: integer("duration"),
  city: varchar("city", { length: 64 }),
  region: varchar("region", { length: 64 }),
  // Heuristic VPN/proxy flag: browser timezone disagrees with the IP's
  // country, or the egress IP is a known proxy/hosting address.
  isProxy: boolean("isproxy"),
  createdAt: timestamp("createdat").defaultNow().notNull(),
});

export type VisitorLog = typeof visitorLogs.$inferSelect;
export type InsertVisitorLog = typeof visitorLogs.$inferInsert;

// Anonymous site feedback ("意见反馈" floating widget). Anyone can submit,
// no login required; a copy is emailed to the site owner on submission.
export const feedback = pgTable("feedback", {
  id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
  content: text("content").notNull(),
  contact: varchar("contact", { length: 200 }),
  page: varchar("page", { length: 256 }),
  createdAt: timestamp("createdat").defaultNow().notNull(),
});

export type Feedback = typeof feedback.$inferSelect;
export type InsertFeedback = typeof feedback.$inferInsert;
