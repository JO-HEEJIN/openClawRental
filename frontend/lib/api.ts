import { API_BASE_URL } from "./constants";
import type { ApiResponse } from "@/types";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async getAuthToken(): Promise<string | null> {
    if (typeof window === "undefined") return null;
    try {
      // Clerk exposes getToken on the global Clerk object after initialization
      const clerk = (window as unknown as Record<string, unknown>).Clerk as
        | { session?: { getToken: () => Promise<string | null> } }
        | undefined;
      return (await clerk?.session?.getToken()) ?? null;
    } catch {
      return null;
    }
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${path}`;
    const token = await this.getAuthToken();

    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    };

    try {
      const res = await fetch(url, {
        ...options,
        headers,
      });

      const json: ApiResponse<T> = await res.json();

      if (!res.ok) {
        return {
          success: false,
          error: json.error || {
            code: "UNKNOWN_ERROR",
            message: `HTTP ${res.status}`,
          },
        };
      }

      return json;
    } catch (error) {
      return {
        success: false,
        error: {
          code: "NETWORK_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "네트워크 오류가 발생했습니다.",
        },
      };
    }
  }

  get<T>(path: string, options?: RequestInit) {
    return this.request<T>(path, { ...options, method: "GET" });
  }

  post<T>(path: string, body?: unknown, options?: RequestInit) {
    return this.request<T>(path, {
      ...options,
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  put<T>(path: string, body?: unknown, options?: RequestInit) {
    return this.request<T>(path, {
      ...options,
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  delete<T>(path: string, options?: RequestInit) {
    return this.request<T>(path, { ...options, method: "DELETE" });
  }
}

export const api = new ApiClient(API_BASE_URL);
