import { Router } from "express";

const router = Router();

const MESHY_BASE = "https://api.meshy.ai";
const MESHY_KEY = process.env["MESHY_API_KEY"] ?? "";
const ANTHROPIC_BASE = process.env["AI_INTEGRATIONS_ANTHROPIC_BASE_URL"] ?? "https://api.anthropic.com";
const ANTHROPIC_KEY = process.env["AI_INTEGRATIONS_ANTHROPIC_API_KEY"] ?? "";

function meshyHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${MESHY_KEY}`,
  };
}

const MESHY_SYSTEM_PROMPT = `You are the Grudge Pipeline AI — a specialist in crafting optimized prompts and settings for the Meshy AI Text-to-3D API to generate game-ready 3D characters.

You know the Meshy API inside-out:
- model options: meshy-5, meshy-6, latest
- topology: quad (better for animation/rigging), triangle
- target_polycount: 5000-50000 ideal for web games; 30000 is standard
- pose_mode: always use "t-pose" for characters that will be rigged — NEVER "a-pose" for rigging
- should_remesh: true for cleaner meshes
- enable_pbr: true for PBR maps (albedo/normal/metalness/roughness)
- target_formats: always include "fbx" and "glb" for game use
- For rigging: the output produces a Mixamo-compatible skeleton with bones like Hips, Spine, Chest, Neck, Head, LeftArm, RightArm, LeftForeArm, RightForeArm, LeftHand, RightHand (hand_r/righthand for gun attachment), LeftUpLeg, RightUpLeg, LeftLeg, RightLeg, LeftFoot, RightFoot

Best practices for game characters:
1. Keep prompts clear, specific, character-focused. Add "full body character" and "T-pose" to prompt.
2. Describe clothing/armor details explicitly (e.g., "wearing dark tactical vest, torn jeans, military boots")
3. 30000 polys is good for web games. 10000-15000 for mobile.
4. After generating the 3D model, always rig it using the /rig endpoint to get Mixamo-compatible FBX.
5. Avoid abstract or non-humanoid shapes if rigging is the goal.

When the user asks for a character, generate an optimized prompt. End your response with a JSON block like this if you have a ready-to-use prompt:

<meshy_params>
{
  "prompt": "...",
  "ai_model": "latest",
  "topology": "quad",
  "target_polycount": 30000,
  "pose_mode": "t-pose",
  "should_remesh": true,
  "enable_pbr": true,
  "target_formats": ["glb", "fbx"]
}
</meshy_params>

The frontend will detect this block and auto-populate the pipeline form.`;

router.post("/meshy/chat", async (req, res) => {
  try {
    const { messages } = req.body as {
      messages: { role: string; content: string }[];
    };

    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: "messages array required" });
      return;
    }

    const anthropicMessages = messages.map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
    }));

    const response = await fetch(`${ANTHROPIC_BASE}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 1024,
        system: MESHY_SYSTEM_PROMPT,
        messages: anthropicMessages,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Anthropic error:", err);
      res.status(502).json({ error: "AI service error", detail: err });
      return;
    }

    const data = (await response.json()) as {
      content: { type: string; text: string }[];
    };
    const reply = data.content?.[0]?.text ?? "";

    let extractedPrompt: string | undefined;
    let extractedParams: Record<string, unknown> | undefined;

    const paramsMatch = reply.match(/<meshy_params>([\s\S]*?)<\/meshy_params>/);
    if (paramsMatch) {
      try {
        extractedParams = JSON.parse(paramsMatch[1].trim());
        extractedPrompt = (extractedParams as { prompt?: string }).prompt;
      } catch {
        // ignore parse error
      }
    }

    const cleanReply = reply.replace(/<meshy_params>[\s\S]*?<\/meshy_params>/, "").trim();

    res.json({ reply: cleanReply, extractedPrompt, extractedParams });
  } catch (e) {
    console.error("Chat route error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/meshy/text-to-3d/preview", async (req, res) => {
  try {
    const body = req.body;
    const payload = {
      mode: "preview",
      prompt: body.prompt,
      ai_model: body.ai_model ?? "latest",
      topology: body.topology ?? "quad",
      target_polycount: body.target_polycount ?? 30000,
      should_remesh: body.should_remesh ?? true,
      pose_mode: body.pose_mode ?? "t-pose",
      enable_pbr: body.enable_pbr ?? true,
      target_formats: body.target_formats ?? ["glb", "fbx"],
    };

    const response = await fetch(`${MESHY_BASE}/openapi/v2/text-to-3d`, {
      method: "POST",
      headers: meshyHeaders(),
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    res.status(response.ok ? 200 : response.status).json(data);
  } catch (e) {
    console.error("Preview route error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/meshy/text-to-3d/refine", async (req, res) => {
  try {
    const { preview_task_id, texture_prompt, enable_pbr, ai_model } = req.body as {
      preview_task_id: string;
      texture_prompt?: string;
      enable_pbr?: boolean;
      ai_model?: string;
    };

    const payload: Record<string, unknown> = {
      mode: "refine",
      preview_task_id,
      enable_pbr: enable_pbr ?? true,
      ai_model: ai_model ?? "latest",
    };
    if (texture_prompt) payload["texture_prompt"] = texture_prompt;

    const response = await fetch(`${MESHY_BASE}/openapi/v2/text-to-3d`, {
      method: "POST",
      headers: meshyHeaders(),
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    res.status(response.ok ? 200 : response.status).json(data);
  } catch (e) {
    console.error("Refine route error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/meshy/text-to-3d/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const response = await fetch(`${MESHY_BASE}/openapi/v2/text-to-3d/${id}`, {
      headers: meshyHeaders(),
    });
    const data = await response.json();
    res.status(response.ok ? 200 : response.status).json(data);
  } catch (e) {
    console.error("Poll task error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/meshy/rig", async (req, res) => {
  try {
    const { input_task_id, model_url, height_meters } = req.body as {
      input_task_id?: string;
      model_url?: string;
      height_meters?: number;
    };

    const payload: Record<string, unknown> = {
      height_meters: height_meters ?? 1.7,
    };
    if (input_task_id) payload["input_task_id"] = input_task_id;
    if (model_url) payload["model_url"] = model_url;

    const response = await fetch(`${MESHY_BASE}/openapi/v1/rigging`, {
      method: "POST",
      headers: meshyHeaders(),
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    res.status(response.ok ? 200 : response.status).json(data);
  } catch (e) {
    console.error("Rig route error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/meshy/rig/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const response = await fetch(`${MESHY_BASE}/openapi/v1/rigging/${id}`, {
      headers: meshyHeaders(),
    });
    const data = await response.json();
    res.status(response.ok ? 200 : response.status).json(data);
  } catch (e) {
    console.error("Poll rig error:", e);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
