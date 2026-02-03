import { generateId } from "../utils/ulid";

export interface UserRow {
  id: string;
  clerk_id: string;
  kakao_id: string | null;
  email: string;
  display_name: string;
  role: "user" | "admin";
  locale: string;
  timezone: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export const UserModel = {
  async findById(db: D1Database, id: string): Promise<UserRow | null> {
    return db.prepare("SELECT * FROM user WHERE id = ?").bind(id).first<UserRow>();
  },

  async findByClerkId(db: D1Database, clerkId: string): Promise<UserRow | null> {
    return db.prepare("SELECT * FROM user WHERE clerk_id = ?").bind(clerkId).first<UserRow>();
  },

  async findByEmail(db: D1Database, email: string): Promise<UserRow | null> {
    return db.prepare("SELECT * FROM user WHERE email = ?").bind(email).first<UserRow>();
  },

  async create(
    db: D1Database,
    data: { clerkId: string; kakaoId?: string; email: string; displayName: string }
  ): Promise<UserRow> {
    const id = generateId();
    const now = new Date().toISOString();
    await db
      .prepare(
        `INSERT INTO user (id, clerk_id, kakao_id, email, display_name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(id, data.clerkId, data.kakaoId ?? null, data.email, data.displayName, now, now)
      .run();

    return (await UserModel.findById(db, id))!;
  },

  async update(
    db: D1Database,
    id: string,
    data: Partial<{ displayName: string; kakaoId: string; isActive: boolean }>
  ): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [];
    if (data.displayName !== undefined) {
      sets.push("display_name = ?");
      values.push(data.displayName);
    }
    if (data.kakaoId !== undefined) {
      sets.push("kakao_id = ?");
      values.push(data.kakaoId);
    }
    if (data.isActive !== undefined) {
      sets.push("is_active = ?");
      values.push(data.isActive ? 1 : 0);
    }
    if (sets.length === 0) return;
    sets.push("updated_at = ?");
    values.push(new Date().toISOString());
    values.push(id);
    await db.prepare(`UPDATE user SET ${sets.join(", ")} WHERE id = ?`).bind(...values).run();
  },

  async list(
    db: D1Database,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<{ results: UserRow[]; total: number }> {
    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    const countResult = await db.prepare("SELECT COUNT(*) as cnt FROM user").first<{ cnt: number }>();
    const results = await db
      .prepare("SELECT * FROM user ORDER BY created_at DESC LIMIT ? OFFSET ?")
      .bind(limit, offset)
      .all<UserRow>();
    return { results: results.results, total: countResult?.cnt ?? 0 };
  },
};
