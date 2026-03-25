import { Router } from "express";
import { db } from "@workspace/db";
import { aiCharacters, insertAiCharacterSchema } from "@workspace/db/schema";
import { desc } from "drizzle-orm";

const router = Router();

router.get("/characters", async (_req, res) => {
  try {
    const chars = await db
      .select()
      .from(aiCharacters)
      .orderBy(desc(aiCharacters.createdAt));
    res.json({ characters: chars });
  } catch (e) {
    console.error("GET /characters error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/characters", async (req, res) => {
  try {
    const parsed = insertAiCharacterSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body", issues: parsed.error.issues });
      return;
    }

    const [created] = await db
      .insert(aiCharacters)
      .values(parsed.data)
      .returning();

    res.status(201).json({ character: created });
  } catch (e) {
    console.error("POST /characters error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
