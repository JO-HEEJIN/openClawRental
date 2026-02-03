import { generateId } from "../utils/ulid";
import type { ConsentType } from "../types";

export interface ConsentRecordRow {
  id: string;
  user_id: string;
  consent_type: ConsentType;
  consent_version: string;
  granted: number;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export const ConsentRecordModel = {
  async create(
    db: D1Database,
    data: {
      userId: string;
      consentType: ConsentType;
      consentVersion: string;
      granted: boolean;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<string> {
    const id = generateId();
    await db
      .prepare(
        `INSERT INTO consent_record (id, user_id, consent_type, consent_version, granted, ip_address, user_agent, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      )
      .bind(
        id,
        data.userId,
        data.consentType,
        data.consentVersion,
        data.granted ? 1 : 0,
        data.ipAddress ?? null,
        data.userAgent ?? null
      )
      .run();
    return id;
  },

  async getLatest(
    db: D1Database,
    userId: string,
    consentType: ConsentType
  ): Promise<ConsentRecordRow | null> {
    return db
      .prepare(
        "SELECT * FROM consent_record WHERE user_id = ? AND consent_type = ? ORDER BY created_at DESC LIMIT 1"
      )
      .bind(userId, consentType)
      .first<ConsentRecordRow>();
  },

  async listByUserId(db: D1Database, userId: string): Promise<ConsentRecordRow[]> {
    const result = await db
      .prepare("SELECT * FROM consent_record WHERE user_id = ? ORDER BY created_at DESC")
      .bind(userId)
      .all<ConsentRecordRow>();
    return result.results;
  },
};
