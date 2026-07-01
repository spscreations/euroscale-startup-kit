import { API_BASE_URL } from "@/lib/constants";
import type {
  CreateDatabaseRequest,
  CreateDatabaseResponse,
  DeleteDatabaseResponse,
  ListDatabasesRequest,
  ListDatabasesResponse,
  GetDatabaseResponse,
  RotateCredentialsResponse,
} from "@/lib/proto/types";

// ── Error Types ─────────────────────────────────────────────────────────────

export class ApiError extends Error {
  public readonly status: number;
  public readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

// ── Token Getter ────────────────────────────────────────────────────────────

type TokenGetter = () => string | null;

// ── ApiClient ───────────────────────────────────────────────────────────────

export class ApiClient {
  private baseUrl: string;
  private getToken: TokenGetter | null = null;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, ""); // strip trailing slash
  }

  /** Register a function that returns the current auth token. */
  setTokenGetter(getToken: TokenGetter): void {
    this.getToken = getToken;
  }

  // ── Core HTTP helpers ──────────────────────────────────────────────────

  private async request<T>(
    path: string,
    options: RequestInit = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) ?? {}),
    };

    const token = this.getToken?.();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
    });

    if (!res.ok) {
      let message = `Request failed (HTTP ${res.status})`;
      let code: string | undefined;
      try {
        const body = await res.json();
        message = body.message ?? message;
        code = body.code;
      } catch {
        // response body is not JSON — keep the default message
      }
      throw new ApiError(message, res.status, code);
    }

    return res.json() as Promise<T>;
  }

  private async get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "GET" });
  }

  private async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: "POST",
      body: body != null ? JSON.stringify(body) : undefined,
    });
  }

  private async del<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: "DELETE" });
  }

  // ── RPC Methods ────────────────────────────────────────────────────────

  /** Provisions a new Vitess database with auto-generated credentials. */
  async createDatabase(
    req: CreateDatabaseRequest,
  ): Promise<CreateDatabaseResponse> {
    return this.post<CreateDatabaseResponse>("/api/v1/databases", req);
  }

  /** Lists all databases owned by the given user. */
  async listDatabases(
    req: ListDatabasesRequest,
  ): Promise<ListDatabasesResponse> {
    const params = new URLSearchParams({ user_id: req.user_id });
    if (req.page_size != null) params.set("page_size", String(req.page_size));
    if (req.page_token) params.set("page_token", req.page_token);
    return this.get<ListDatabasesResponse>(
      `/api/v1/databases?${params.toString()}`,
    );
  }

  /** Gets metadata for a single database (no credentials). */
  async getDatabase(databaseId: string): Promise<GetDatabaseResponse> {
    return this.get<GetDatabaseResponse>(
      `/api/v1/databases/${encodeURIComponent(databaseId)}`,
    );
  }

  /** Drops a database and removes all associated credentials. */
  async deleteDatabase(databaseId: string): Promise<DeleteDatabaseResponse> {
    return this.del<DeleteDatabaseResponse>(
      `/api/v1/databases/${encodeURIComponent(databaseId)}`,
    );
  }

  /** Rotates credentials for an existing database. */
  async rotateCredentials(
    databaseId: string,
  ): Promise<RotateCredentialsResponse> {
    return this.post<RotateCredentialsResponse>(
      `/api/v1/databases/${encodeURIComponent(databaseId)}/rotate-credentials`,
    );
  }
}

// ── Singleton ───────────────────────────────────────────────────────────────

/** Shared ApiClient instance. Call `setTokenGetter` once auth is ready. */
export const apiClient = new ApiClient();
