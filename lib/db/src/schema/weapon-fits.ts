import { pgTable, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Persistent weapon-to-bone fit data — position, rotation (Euler XYZ), and
 * uniform scale of a weapon prop relative to the hand bone it is attached to.
 * Authored via the ModelViewer calibration tool and consumed by Player.tsx.
 *
 * Primary key is the weapon key string (e.g. "sword", "pistol") so upserts
 * are a single PUT with no auto-increment ID needed.
 */
export const weaponFits = pgTable("weapon_fits", {
  weaponKey: text("weapon_key").primaryKey(),
  boneName:  text("bone_name").notNull().default("mixamorigRightHand"),

  posX: real("pos_x").notNull().default(0),
  posY: real("pos_y").notNull().default(0),
  posZ: real("pos_z").notNull().default(0),

  rotX: real("rot_x").notNull().default(0),
  rotY: real("rot_y").notNull().default(0),
  rotZ: real("rot_z").notNull().default(0),

  scaleVal: real("scale_val").notNull().default(0.01),

  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertWeaponFitSchema = createInsertSchema(weaponFits);
export const upsertWeaponFitSchema = insertWeaponFitSchema;

export type InsertWeaponFit = z.infer<typeof insertWeaponFitSchema>;
export type WeaponFitRow    = typeof weaponFits.$inferSelect;
