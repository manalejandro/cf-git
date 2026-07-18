import type { Queue } from "@/lib/types/env";

export interface DeliveryMessage {
  inboxUrl: string;
  activity: string;
  senderId: string;
  senderKeyId: string;
  privateKeyPem: string;
}

export async function enqueueDeliveries(
  queue: Queue | undefined,
  inboxes: string[],
  activityJson: string,
  senderId: string,
  senderKeyId: string,
  privateKeyPem: string
): Promise<void> {
  if (!queue) {
    console.error("[queue] Queue binding is undefined");
    return;
  }
  if (!inboxes.length || !activityJson || !senderId || !senderKeyId || !privateKeyPem) {
    console.error("[queue] Invalid args:", { inboxLen: inboxes.length, hasAct: !!activityJson, senderId, hasKey: !!senderKeyId, hasPem: !!privateKeyPem });
    return;
  }
  const batchSize = 100;
  for (let i = 0; i < inboxes.length; i += batchSize) {
    const batch = inboxes.slice(i, i + batchSize);
    const messages = batch.map((inboxUrl) => ({
      body: { inboxUrl, activity: activityJson, senderId, senderKeyId, privateKeyPem },
    }));
    try {
      await queue.sendBatch(messages);
    } catch (err) {
      console.error("[queue] Error sending batch:", err);
    }
  }
}

export async function enqueueDelivery(
  queue: Queue,
  inboxUrl: string,
  activityJson: string,
  senderId: string,
  senderKeyId: string,
  privateKeyPem: string
): Promise<void> {
  const message: DeliveryMessage = {
    inboxUrl,
    activity: activityJson,
    senderId,
    senderKeyId,
    privateKeyPem,
  };
  try {
    await queue.send(message);
  } catch (err) {
    console.error("[queue] Error sending:", err);
  }
}
