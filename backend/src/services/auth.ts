import type { Env, AuthUser } from "../types";
import { UserModel, type UserRow } from "../models/user";
import { CreditBalanceModel } from "../models/credit-balance";

interface ClerkJWTPayload {
  sub: string;          // Clerk user ID
  email?: string;
  name?: string;
  iss: string;
  exp: number;
  nbf: number;
  iat: number;
  azp?: string;
}

interface JWK {
  kty: string;
  n: string;
  e: string;
  kid: string;
  alg: string;
  use: string;
}

interface JWKS {
  keys: JWK[];
}

let cachedJwks: { keys: JWKS; fetchedAt: number } | null = null;
const JWKS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4;
  const padded = pad ? base64 + "=".repeat(4 - pad) : base64;
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function decodeJwtPayload(token: string): ClerkJWTPayload {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT format");
  const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
  return payload as ClerkJWTPayload;
}

function getJwtKid(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
  return header.kid ?? null;
}

async function fetchJwks(clerkSecretKey: string): Promise<JWKS> {
  const now = Date.now();
  if (cachedJwks && now - cachedJwks.fetchedAt < JWKS_CACHE_TTL_MS) {
    return cachedJwks.keys;
  }

  // Clerk JWKS endpoint derived from the secret key
  // Clerk frontend API domain is extracted from the key or use the standard endpoint
  const response = await fetch("https://api.clerk.com/v1/jwks", {
    headers: {
      Authorization: `Bearer ${clerkSecretKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS: ${response.status}`);
  }

  const jwks = (await response.json()) as JWKS;
  cachedJwks = { keys: jwks, fetchedAt: now };
  return jwks;
}

async function importJwk(jwk: JWK): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    {
      kty: jwk.kty,
      n: jwk.n,
      e: jwk.e,
      alg: jwk.alg,
      ext: true,
    },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"]
  );
}

async function verifyJwtSignature(token: string, key: CryptoKey): Promise<boolean> {
  const parts = token.split(".");
  const signatureInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const signature = base64UrlDecode(parts[2]);
  return crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, signatureInput);
}

export async function verifyClerkToken(
  token: string,
  env: Env
): Promise<ClerkJWTPayload> {
  // Decode header to get kid
  const kid = getJwtKid(token);
  if (!kid) throw new Error("Missing kid in JWT header");

  // Fetch JWKS
  const jwks = await fetchJwks(env.CLERK_SECRET_KEY);
  const jwk = jwks.keys.find((k) => k.kid === kid);
  if (!jwk) throw new Error("No matching key found in JWKS");

  // Import key and verify signature
  const cryptoKey = await importJwk(jwk);
  const valid = await verifyJwtSignature(token, cryptoKey);
  if (!valid) throw new Error("Invalid JWT signature");

  // Decode and validate claims
  const payload = decodeJwtPayload(token);
  const now = Math.floor(Date.now() / 1000);

  if (payload.exp && payload.exp < now) {
    throw new Error("Token expired");
  }
  if (payload.nbf && payload.nbf > now + 30) {
    throw new Error("Token not yet valid");
  }

  return payload;
}

export async function getOrCreateUser(
  db: D1Database,
  clerkPayload: ClerkJWTPayload
): Promise<AuthUser> {
  // Look up existing user by Clerk ID
  let userRow = await UserModel.findByClerkId(db, clerkPayload.sub);

  if (!userRow) {
    // Create new user
    userRow = await UserModel.create(db, {
      clerkId: clerkPayload.sub,
      email: clerkPayload.email ?? `${clerkPayload.sub}@clerk.user`,
      displayName: clerkPayload.name ?? "",
    });
    // Initialize credit balance for new user
    await CreditBalanceModel.initialize(db, userRow.id);
  }

  return {
    userId: userRow.id,
    clerkId: userRow.clerk_id,
    email: userRow.email,
    displayName: userRow.display_name,
    role: userRow.role as "user" | "admin",
  };
}
