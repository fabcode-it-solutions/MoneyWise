import Pusher from "pusher";
import { config } from "../config.js";

let client: Pusher | null = null;

function getClient(): Pusher | null {
  if (!config.pusherAppId || !config.pusherKey || !config.pusherSecret) return null;
  if (!client) {
    client = new Pusher({
      appId: config.pusherAppId,
      key: config.pusherKey,
      secret: config.pusherSecret,
      cluster: config.pusherCluster,
      useTLS: true,
    });
  }
  return client;
}

export async function notifyDataChanged(userId: string): Promise<void> {
  const p = getClient();
  if (!p) return;
  try {
    await p.trigger(`user-${userId}`, "data-changed", {});
  } catch (err) {
    console.error("[PUSHER] Trigger failed:", err);
  }
}

export async function notifySpaceDataChanged(spaceId: string): Promise<void> {
  const p = getClient();
  if (!p) return;
  try {
    await p.trigger(`space-${spaceId}`, "data-changed", {});
  } catch (err) {
    console.error("[PUSHER] Space trigger failed:", err);
  }
}
