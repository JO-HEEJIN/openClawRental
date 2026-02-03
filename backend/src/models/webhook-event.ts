import { generateId } from "../utils/ulid";

export interface WebhookEventRow {
  id: string;
  idempotency_key: string;
  imp_uid: string;
  event_type: string;
  payload_json: string;
  processed_at: string | null;
  created_at: string;
}

export const WebhookEventModel = {
  async findByIdempotencyKey(db: D1Database, key: string): Promise<WebhookEventRow | null> {
    return db
      .prepare("SELECT * FROM webhook_event WHERE idempotency_key = ?")
      .bind(key)
      .first<WebhookEventRow>();
  },

  async create(
    db: D1Database,
    data: { impUid: string; eventType: string; payloadJson: string }
  ): Promise<string> {
    const id = generateId();
    const idempotencyKey = `${data.impUid}_${data.eventType}`;
    await db
      .prepare(
        `INSERT INTO webhook_event (id, idempotency_key, imp_uid, event_type, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`
      )
      .bind(id, idempotencyKey, data.impUid, data.eventType, data.payloadJson)
      .run();
    return id;
  },

  async markProcessed(db: D1Database, id: string): Promise<void> {
    await db
      .prepare("UPDATE webhook_event SET processed_at = datetime('now') WHERE id = ?")
      .bind(id)
      .run();
  },
};
