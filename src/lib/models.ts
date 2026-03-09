import { CopilotClient } from "@github/copilot-sdk";
import { FALLBACK_MODELS, type ModelOption } from "./model-types";

export type { ModelOption };
export { FALLBACK_MODELS };

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

let cachedModels: ModelOption[] | null = null;
let cachedAt = 0;

export function clearModelCache(): void {
  cachedModels = null;
  cachedAt = 0;
}

export async function getModels(): Promise<ModelOption[]> {
  if (cachedModels && Date.now() - cachedAt < CACHE_TTL_MS) {
    console.log(`[models] Returning ${cachedModels.length} cached models`);
    return cachedModels;
  }

  try {
    console.log("[models] Fetching models from Copilot SDK...");
    const client = new CopilotClient();
    try {
      await client.start();
      const models = await client.listModels();
      const available = models
        .filter((m) => m.policy?.state !== "disabled")
        .map((m) => ({ id: m.id, name: m.name }));

      if (available.length > 0) {
        console.log(
          `[models] Loaded ${available.length} models from Copilot SDK`,
        );
        cachedModels = available;
        cachedAt = Date.now();
        return available;
      }
      console.warn(
        "[models] Copilot SDK returned no enabled models, using fallback",
      );
    } finally {
      await client.stop();
    }
  } catch (err) {
    console.warn(
      "[models] Failed to load models from Copilot SDK, using fallback:",
      (err as Error).message ?? err,
    );
  }

  cachedModels = FALLBACK_MODELS;
  cachedAt = Date.now();
  return FALLBACK_MODELS;
}
