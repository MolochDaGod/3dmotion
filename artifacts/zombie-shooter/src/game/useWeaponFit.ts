/**
 * useWeaponFit — fetches weapon-bone attachment transforms from the API,
 * with localStorage as an instant-read cache and hard-coded defaults as
 * the final fallback.
 *
 * Usage:
 *   const { getFit, saveFit } = useWeaponFit();
 *   const fit = getFit("sword");  // → WeaponFitOffset
 *   await saveFit("sword", { position:[0,0,0], rotation:[0,0,-1.57], scale:[0.01,0.01,0.01] });
 */

import { useState, useEffect, useCallback } from "react";
import {
  type WeaponFitOffset,
  WEAPON_FIT_DEFAULTS,
  getWeaponFitDefault,
} from "./data/weaponFitDefaults";

export type { WeaponFitOffset };

const LS_KEY = (k: string) => `weapon_fit_${k}`;

function readLocalFit(key: string): WeaponFitOffset | null {
  try {
    const raw = localStorage.getItem(LS_KEY(key));
    if (raw) return JSON.parse(raw) as WeaponFitOffset;
  } catch { /* corrupt */ }
  return null;
}

function writeLocalFit(key: string, fit: WeaponFitOffset) {
  try { localStorage.setItem(LS_KEY(key), JSON.stringify(fit)); } catch { /* quota */ }
}

function rowToOffset(row: {
  posX: number; posY: number; posZ: number;
  rotX: number; rotY: number; rotZ: number;
  scaleVal: number;
  boneName: string;
}): WeaponFitOffset {
  return {
    position: [row.posX, row.posY, row.posZ],
    rotation: [row.rotX, row.rotY, row.rotZ],
    scale:    [row.scaleVal, row.scaleVal, row.scaleVal],
    boneName: row.boneName,
  };
}

export function useWeaponFit() {
  const [fitData, setFitData] = useState<Record<string, WeaponFitOffset>>(() => {
    const initial: Record<string, WeaponFitOffset> = {};
    for (const key of Object.keys(WEAPON_FIT_DEFAULTS)) {
      const local = readLocalFit(key);
      if (local) initial[key] = local;
    }
    return initial;
  });

  useEffect(() => {
    const baseUrl = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    fetch(`${baseUrl}/api/weapon-fits`)
      .then((r) => r.json())
      .then((data: { fits: Array<{
        weaponKey: string;
        boneName: string;
        posX: number; posY: number; posZ: number;
        rotX: number; rotY: number; rotZ: number;
        scaleVal: number;
      }> }) => {
        const record: Record<string, WeaponFitOffset> = {};
        for (const row of data.fits) {
          record[row.weaponKey] = rowToOffset(row);
        }
        setFitData((prev) => ({ ...prev, ...record }));
      })
      .catch(() => {
      });
  }, []);

  const getFit = useCallback(
    (key: string): WeaponFitOffset =>
      fitData[key] ?? getWeaponFitDefault(key),
    [fitData],
  );

  const saveFit = useCallback(async (key: string, fit: WeaponFitOffset) => {
    writeLocalFit(key, fit);
    setFitData((prev) => ({ ...prev, [key]: fit }));

    const baseUrl = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    const body = {
      boneName: fit.boneName,
      posX: fit.position[0], posY: fit.position[1], posZ: fit.position[2],
      rotX: fit.rotation[0], rotY: fit.rotation[1], rotZ: fit.rotation[2],
      scaleVal: fit.scale[0],
    };
    try {
      await fetch(`${baseUrl}/api/weapon-fits/${key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch { /* offline fallback — localStorage already updated */ }
  }, []);

  return { getFit, saveFit, fitData };
}
