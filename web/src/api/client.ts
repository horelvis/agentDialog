import type { ApiError } from "./types";
import { API_BASE } from "@/lib/constants";

class ApiClient {
  private getToken(): string | null {
    return localStorage.getItem("token");
  }

  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });

    if (!res.ok) {
      if (res.status === 401 && !path.includes("/auth/")) {
        localStorage.removeItem("token");
        window.location.href = "/login";
        throw new Error("Unauthorized");
      }
      const error: ApiError = await res.json().catch(() => ({
        error: { code: "UNKNOWN", message: res.statusText },
      }));
      throw error;
    }

    if (res.status === 204) return undefined as T;
    return res.json();
  }

  get<T>(path: string) {
    return this.request<T>(path);
  }

  post<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  patch<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  delete<T>(path: string) {
    return this.request<T>(path, { method: "DELETE" });
  }

  async upload<T>(path: string, file: File): Promise<T> {
    const token = this.getToken();
    const formData = new globalThis.FormData();
    formData.append("file", file);

    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers,
      body: formData,
    });

    if (!res.ok) {
      const error: ApiError = await res.json().catch(() => ({
        error: { code: "UNKNOWN", message: res.statusText },
      }));
      throw error;
    }

    return res.json();
  }
}

export const api = new ApiClient();
