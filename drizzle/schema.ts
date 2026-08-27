import { int, json, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

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
  role: mysqlEnum("role", ["user", "revisor", "aprovador", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const protocolFlows = mysqlTable("protocolFlows", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull().references(() => users.id),
  title: varchar("title", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["draft", "under_review", "approved", "archived"]).notNull().default("draft"),
  currentVersion: int("currentVersion").notNull().default(1),
  modelJson: json("modelJson").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const flowVersions = mysqlTable("flowVersions", {
  id: int("id").autoincrement().primaryKey(),
  flowId: int("flowId").notNull().references(() => protocolFlows.id),
  versionNumber: int("versionNumber").notNull(),
  status: mysqlEnum("status", ["draft", "under_review", "approved", "archived"]).notNull().default("draft"),
  changeSummary: text("changeSummary").notNull(),
  snapshot: json("snapshot").notNull(),
  authorId: int("authorId").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("flow_versions_flow_version_idx").on(table.flowId, table.versionNumber)]);

export const flowComments = mysqlTable("flowComments", {
  id: int("id").autoincrement().primaryKey(),
  flowId: int("flowId").notNull().references(() => protocolFlows.id),
  elementId: varchar("elementId", { length: 128 }),
  content: text("content").notNull(),
  status: mysqlEnum("status", ["open", "resolved"]).notNull().default("open"),
  authorId: int("authorId").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  resolvedAt: timestamp("resolvedAt"),
});

export const flowCommentAttachments = mysqlTable("flowCommentAttachments", {
  id: int("id").autoincrement().primaryKey(),
  commentId: int("commentId").notNull().references(() => flowComments.id),
  storageKey: varchar("storageKey", { length: 500 }).notNull(),
  url: varchar("url", { length: 750 }).notNull(),
  filename: varchar("filename", { length: 255 }).notNull(),
  mimeType: varchar("mimeType", { length: 120 }).notNull(),
  size: int("size").notNull(),
  authorId: int("authorId").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const flowAuditEvents = mysqlTable("flowAuditEvents", {
  id: int("id").autoincrement().primaryKey(),
  flowId: int("flowId").notNull().references(() => protocolFlows.id),
  actorId: int("actorId").notNull().references(() => users.id),
  action: varchar("action", { length: 80 }).notNull(),
  context: json("context").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const flowMembers = mysqlTable("flowMembers", {
  id: int("id").autoincrement().primaryKey(),
  flowId: int("flowId").notNull().references(() => protocolFlows.id),
  userId: int("userId").notNull().references(() => users.id),
  assignedBy: int("assignedBy").notNull().references(() => users.id),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [uniqueIndex("flow_members_flow_user_idx").on(table.flowId, table.userId)]);

export type ProtocolFlow = typeof protocolFlows.$inferSelect;
export type FlowVersion = typeof flowVersions.$inferSelect;
export type FlowComment = typeof flowComments.$inferSelect;
export type FlowCommentAttachment = typeof flowCommentAttachments.$inferSelect;
export type FlowAuditEvent = typeof flowAuditEvents.$inferSelect;
export type FlowMember = typeof flowMembers.$inferSelect;
