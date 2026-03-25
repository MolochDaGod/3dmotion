import { pgTable, uuid, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const aiCharacters = pgTable("ai_characters", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  meshUrl: text("mesh_url").notNull(),
  scale: real("scale").notNull().default(0.01),
  capsuleHH: real("capsule_hh").notNull().default(0.5),
  capsuleR: real("capsule_r").notNull().default(0.35),
  color: text("color").notNull().default("#39ff14"),
  source: text("source").notNull().default("meshy"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAiCharacterSchema = createInsertSchema(aiCharacters).omit({
  id: true,
  createdAt: true,
});

export type InsertAiCharacter = z.infer<typeof insertAiCharacterSchema>;
export type AiCharacter = typeof aiCharacters.$inferSelect;
