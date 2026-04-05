/**
 * /weapon-fits routes
 *
 * GET  /weapon-fits            → { fits: WeaponFitRow[] }
 * PUT  /weapon-fits/:weaponKey → upsert a single weapon fit
 *      Body: { boneName?, posX,posY,posZ, rotX,rotY,rotZ, scaleVal }
 *      Returns: { fit: WeaponFitRow }
 */
import { Router } from "express";
import { db } from "@workspace/db";
import { weaponFits } from "@workspace/db/schema";

const router = Router();

router.get("/weapon-fits", async (_req, res) => {
  try {
    const fits = await db.select().from(weaponFits);
    res.json({ fits });
  } catch (e) {
    console.error("GET /weapon-fits error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

interface WeaponFitBody {
  boneName?: string;
  posX?: number;
  posY?: number;
  posZ?: number;
  rotX?: number;
  rotY?: number;
  rotZ?: number;
  scaleVal?: number;
}

router.put("/weapon-fits/:weaponKey", async (req, res) => {
  try {
    const { weaponKey } = req.params;
    if (!weaponKey || typeof weaponKey !== "string") {
      res.status(400).json({ error: "weaponKey must be a non-empty string" });
      return;
    }

    const body = req.body as WeaponFitBody;
    const toNum = (v: unknown, def = 0) =>
      typeof v === "number" && isFinite(v) ? v : def;

    const data = {
      boneName: typeof body.boneName === "string" ? body.boneName : "mixamorigRightHand",
      posX:     toNum(body.posX),
      posY:     toNum(body.posY),
      posZ:     toNum(body.posZ),
      rotX:     toNum(body.rotX),
      rotY:     toNum(body.rotY),
      rotZ:     toNum(body.rotZ),
      scaleVal: toNum(body.scaleVal, 0.01),
    };

    const [fit] = await db
      .insert(weaponFits)
      .values({ weaponKey, ...data })
      .onConflictDoUpdate({
        target: weaponFits.weaponKey,
        set: { ...data, updatedAt: new Date() },
      })
      .returning();

    res.json({ fit });
  } catch (e) {
    console.error("PUT /weapon-fits/:key error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
