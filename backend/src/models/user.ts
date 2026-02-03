import { generateId } from "../utils/ulid";

export interface UserRow {
  id: string;
  kakao_id: string;
  email: string | null;
  display_name: string;
  profile_image_url: string | null;
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

  async findByKakaoId(db: D1Database, kakaoId: string): Promise<UserRow | null> {
    return db.prepare("SELECT * FROM user WHERE kakao_id = ?").bind(kakaoId).first<UserRow>();
  },

  async findByEmail(db: D1Database, email: string): Promise<UserRow | null> {
    return db.prepare("SELECT * FROM user WHERE email = ?").bind(email).first<UserRow>();
  },

  async create(
    db: D1Database,
    data: { kakaoId: string; email?: string | null; displayName: string; profileImageUrl?: string | null }
  ): Promise<UserRow> {
    const id = generateId();
    const now = new Date().toISOString();
    await db
      .prepare(
        `INSERT INTO user (id, kakao_id, email, display_name, profile_image_url, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(id, data.kakaoId, data.email ?? null, data.displayName, data.profileImageUrl ?? null, now, now)
      .run();

    return (await UserModel.findById(db, id))!;
  },

  async update(
    db: D1Database,
    id: string,
    data: Partial<{ displayName: string; email: string; profileImageUrl: string; isActive: boolean }>
  ): Promise<void> {
    const sets: string[] = [];
    const values: unknown[] = [];
    if (data.displayName !== undefined) {
      sets.push("display_name = ?");
      values.push(data.displayName);
    }
    if (data.email !== undefined) {
      sets.push("email = ?");
      values.push(data.email);
    }
    if (data.profileImageUrl !== undefined) {
      sets.push("profile_image_url = ?");
      values.push(data.profileImageUrl);
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
