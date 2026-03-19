import type {
  SourceSummary,
  StoredView,
  AuthStatus,
  ViewComponent,
} from "../types/config";
import { isTauri } from "../lib/utils";

// --- API Client ---

const DEFAULT_TAURI_API_PORT = 18640;
const DEFAULT_TAURI_BACKEND_BASE_URL = `http://127.0.0.1:${DEFAULT_TAURI_API_PORT}/api`;
const WEB_BASE_URL = "/api";

type RuntimePortInfo = {
  api_target_port?: number;
};

let tauriResolvedBaseUrl: Promise<string> | null = null;
let tauriCachedBaseUrl: string | null = null;
let backendReady = false;
let backendReadyPromise: Promise<void> | null = null;

type WaitForBackendOptions = {
  force?: boolean;
  timeoutMs?: number;
  intervalMs?: number;
  probeTimeoutMs?: number;
};

async function resolveApiBaseUrl(): Promise<string> {
  if (!isTauri()) {
    return WEB_BASE_URL;
  }

  if (tauriCachedBaseUrl) {
    return tauriCachedBaseUrl;
  }

  if (!tauriResolvedBaseUrl) {
    tauriResolvedBaseUrl = import("@tauri-apps/api/core")
      .then(({ invoke }) =>
        invoke<RuntimePortInfo>("get_runtime_port_info")
          .then((info) => {
            const port = Number(info?.api_target_port);
            if (Number.isFinite(port) && port > 0) {
              const resolved = `http://127.0.0.1:${port}/api`;
              tauriCachedBaseUrl = resolved;
              return resolved;
            }
            tauriCachedBaseUrl = DEFAULT_TAURI_BACKEND_BASE_URL;
            return tauriCachedBaseUrl;
          })
          .catch(() => {
            tauriResolvedBaseUrl = null;
            return DEFAULT_TAURI_BACKEND_BASE_URL;
          }),
      )
      .catch(() => {
        tauriResolvedBaseUrl = null;
        return DEFAULT_TAURI_BACKEND_BASE_URL;
      });
  }

  return tauriResolvedBaseUrl;
}

export function getApiBaseUrl(): string {
  return isTauri() ? DEFAULT_TAURI_BACKEND_BASE_URL : WEB_BASE_URL;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function probeBackend(baseUrl: string, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/system/health`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function ensureBackendReady(options: WaitForBackendOptions = {}): Promise<void> {
  const {
    force = false,
    timeoutMs = 20_000,
    intervalMs = 250,
    probeTimeoutMs = 1_500,
  } = options;

  if (force) {
    backendReady = false;
    backendReadyPromise = null;
  }

  if (backendReady) {
    return;
  }

  if (backendReadyPromise) {
    return backendReadyPromise;
  }

  backendReadyPromise = (async () => {
    const deadline = Date.now() + timeoutMs;
    let currentInterval = intervalMs;

    while (Date.now() < deadline) {
      const baseUrl = await resolveApiBaseUrl();
      const ready = await probeBackend(baseUrl, probeTimeoutMs);
      if (ready) {
        backendReady = true;
        return;
      }

      await sleep(currentInterval);
      currentInterval = Math.min(Math.floor(currentInterval * 1.35), 1_000);
    }

    throw new Error("Backend startup timed out");
  })();

  try {
    await backendReadyPromise;
  } finally {
    if (!backendReady) {
      backendReadyPromise = null;
    }
  }
}

export interface ReloadConfigDiagnostic {
  source?: "backend" | "editor";
  file?: string;
  line?: number;
  column?: number;
  code?: string;
  message: string;
  field_path?: string;
  fieldPath?: string;
}

export interface ReloadConfigChangedFile {
  filename: string;
  integration_id: string;
  change_scope: "view" | "logic";
  changed_fields: string[];
  related_sources: string[];
  auto_refreshed_sources: string[];
}

export interface ReloadConfigResponse {
  message: string;
  affected_sources: string[];
  auto_refreshed_sources: string[];
  changed_files: ReloadConfigChangedFile[];
  total_sources: number;
}

export interface IntegrationFileResponse {
  filename: string;
  content: string;
  integration_ids?: string[];
  display_name?: string | null;
  resolved_path?: string | null;
}

export interface IntegrationFileMetadata {
  filename: string;
  id: string;
  name?: string | null;
}

export interface IntegrationPresetResponse {
  id: string;
  label: string;
  description: string;
  filename_hint: string;
  content_template: string;
}

export interface SourceDeleteCleanup {
  data_cleared: boolean;
  secrets_cleared: boolean;
  affected_view_ids: string[];
  affected_view_count: number;
  warnings: string[];
}

export interface SourceDeleteResponse {
  message: string;
  source_id: string;
  cleanup?: SourceDeleteCleanup;
}

class ApiClient {
  async waitForBackendReady(timeoutMs = 20_000): Promise<void> {
    await ensureBackendReady({ timeoutMs });
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    await ensureBackendReady();
    const baseUrl = await resolveApiBaseUrl();
    return fetch(`${baseUrl}${path}`, init);
  }

  private async parseErrorMessage(
    res: Response,
    fallback: string,
  ): Promise<string> {
    try {
      const payload = await res.json();
      if (payload && typeof payload === "object") {
        const detail = "detail" in payload ? payload.detail : null;
        const message = "message" in payload ? payload.message : null;
        if (typeof detail === "string" && detail.trim()) return detail;
        if (typeof message === "string" && message.trim()) return message;
      }
    } catch {
      // ignore non-JSON responses and keep fallback
    }
    return fallback;
  }

  async getSources(): Promise<SourceSummary[]> {
    const res = await this.request(`/sources`);
    if (!res.ok) throw new Error("Failed to fetch sources");
    return res.json();
  }

  async getSourceData(sourceId: string): Promise<any> {
    const res = await this.request(`/data/${sourceId}`);
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`Failed to fetch data for ${sourceId}`);
    }
    return res.json();
  }

  async getHistory(sourceId: string, limit = 100): Promise<any[]> {
    const res = await this.request(`/data/${sourceId}/history?limit=${limit}`,
    );
    if (!res.ok) return [];
    return res.json();
  }

  async refreshSource(sourceId: string): Promise<void> {
    const encodedSourceId = encodeURIComponent(sourceId);
    const res = await this.request(`/refresh/${encodedSourceId}`, {
      method: "POST",
    });
    if (!res.ok) {
      const fallback = `Failed to refresh source ${sourceId} (HTTP ${res.status})`;
      throw new Error(await this.parseErrorMessage(res, fallback));
    }
  }

  async refreshAll(): Promise<void> {
    const res = await this.request(`/refresh`, { method: "POST" });
    if (!res.ok) {
      throw new Error(
        await this.parseErrorMessage(
          res,
          `Failed to refresh sources (HTTP ${res.status})`,
        ),
      );
    }
  }

  // --- Views ---

  async getViews(): Promise<StoredView[]> {
    const res = await this.request(`/views`);
    if (!res.ok) throw new Error("Failed to fetch views");
    return res.json();
  }

  async createView(view: StoredView): Promise<StoredView> {
    const res = await this.request(`/views`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(view),
    });
    if (!res.ok) throw new Error("Failed to create view");
    return res.json();
  }

  async updateView(viewId: string, view: StoredView): Promise<StoredView> {
    const res = await this.request(`/views/${viewId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(view),
    });
    if (!res.ok) throw new Error(`Failed to update view ${viewId}`);
    return res.json();
  }

  async deleteView(viewId: string): Promise<void> {
    const res = await this.request(`/views/${viewId}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(`Failed to delete view ${viewId}`);
  }

  // --- Interaction ---

  async interact(sourceId: string, data: Record<string, any>): Promise<void> {
    const res = await this.request(`/sources/${sourceId}/interact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Interaction failed for ${sourceId}`);
    }
  }

  async oauthCallbackInteract(
    data: Record<string, any>,
  ): Promise<{ message: string; source_id: string }> {
    const res = await this.request(`/oauth/callback/interact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        err.detail || err.message || "OAuth callback interaction failed",
      );
    }
    return res.json();
  }

  async getAuthorizeUrl(
    sourceId: string,
    redirectUri: string,
  ): Promise<
    | { flow: "code"; authorize_url: string; message?: string }
    | {
        flow: "device";
        device: {
          user_code: string;
          verification_uri: string;
          verification_uri_complete?: string;
          expires_in: number;
          interval: number;
        };
        message?: string;
      }
    | { flow: "client_credentials"; status: "authorized"; message?: string }
  > {
    const params = new URLSearchParams({ redirect_uri: redirectUri });
    const res = await this.request(`/oauth/authorize/${sourceId}?${params}`,
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Failed to start OAuth for ${sourceId}`);
    }
    return res.json();
  }

  async getDeviceFlowStatus(sourceId: string): Promise<{
    status: "idle" | "pending" | "authorized" | "expired" | "denied" | "error";
    retry_after?: number;
    error?: string;
    error_description?: string;
    device?: {
      user_code: string;
      verification_uri: string;
      verification_uri_complete?: string;
      expires_in: number;
      interval: number;
    };
  }> {
    const res = await this.request(`/oauth/device/status/${sourceId}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Failed to get device flow status for ${sourceId}`);
    }
    return res.json();
  }

  async pollDeviceToken(sourceId: string): Promise<{
    status: "pending" | "authorized" | "expired" | "denied" | "error";
    retry_after?: number;
    error?: string;
    error_description?: string;
  }> {
    const res = await this.request(`/oauth/device/poll/${sourceId}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Failed polling device flow for ${sourceId}`);
    }
    return res.json();
  }

  async getAuthStatus(sourceId: string): Promise<AuthStatus> {
    const res = await this.request(`/sources/${sourceId}/auth-status`);
    if (!res.ok) throw new Error(`Failed to check auth status for ${sourceId}`);
    return res.json();
  }

  // --- Integration Management ---

  async getIntegrationTemplates(
    integrationId: string,
  ): Promise<ViewComponent[]> {
    const res = await this.request(`/integrations/${integrationId}/templates`,
    );
    if (!res.ok)
      throw new Error(`Failed to fetch templates for ${integrationId}`);
    return res.json();
  }

  async listIntegrationFiles(): Promise<string[]> {
    const res = await this.request(`/integrations/files`);
    if (!res.ok) throw new Error("Failed to fetch integrations");
    return res.json();
  }

  async listIntegrationFileMetadata(): Promise<IntegrationFileMetadata[]> {
    const res = await this.request(`/integrations/files/meta`);
    if (!res.ok) throw new Error("Failed to fetch integration metadata");
    return res.json();
  }

  async listIntegrationPresets(): Promise<IntegrationPresetResponse[]> {
    const res = await this.request(`/integrations/presets`);
    if (!res.ok) throw new Error("Failed to fetch integration presets");
    return res.json();
  }

  async getIntegrationFile(
    filename: string,
  ): Promise<IntegrationFileResponse> {
    const encodedFilename = encodeURIComponent(filename);
    const cacheBust = Date.now();
    const res = await this.request(
      `/integrations/files/${encodedFilename}?_ts=${cacheBust}`,
      { cache: "no-store" },
    );
    if (!res.ok) throw new Error(`Failed to fetch integration ${filename}`);
    return res.json();
  }

  async createIntegrationFile(
    filename: string,
    content: string = "",
  ): Promise<{ filename: string }> {
    const res = await this.request(`/integrations/files?filename=${encodeURIComponent(filename)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      },
    );
    if (!res.ok) throw new Error(`Failed to create integration ${filename}`);
    return res.json();
  }

  async saveIntegrationFile(filename: string, content: string): Promise<void> {
    const res = await this.request(`/integrations/files/${filename}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);

      // Check if backend returned structured validation errors
      if (payload && typeof payload === "object" && "detail" in payload) {
        const detail = typeof payload.detail === "string"
          ? payload.detail
          : payload.detail?.message || "Failed to save integration";

        const diagnostics =
          payload.detail &&
          typeof payload.detail === "object" &&
          "diagnostics" in payload.detail &&
          Array.isArray(payload.detail.diagnostics)
            ? (payload.detail.diagnostics as ReloadConfigDiagnostic[])
            : [];

        const saveError = Object.assign(new Error(detail), {
          diagnostics,
          detail,
          status: res.status,
        });
        throw saveError;
      }

      throw new Error(`Failed to save integration ${filename}`);
    }
  }

  async deleteIntegrationFile(filename: string): Promise<void> {
    const res = await this.request(`/integrations/files/${filename}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(`Failed to delete integration ${filename}`);
  }

  async getIntegrationSources(filename: string): Promise<any[]> {
    const res = await this.request(`/integrations/files/${filename}/sources`,
    );
    if (!res.ok) throw new Error(`Failed to fetch sources for ${filename}`);
    return res.json();
  }

  // --- Source Management ---

  async listSourceFiles(): Promise<string[]> {
    const res = await this.request(`/sources/files`);
    if (!res.ok) throw new Error("Failed to fetch sources");
    return res.json();
  }

  async getSourceFile(
    filename: string,
  ): Promise<{ filename: string; content: string }> {
    const res = await this.request(`/sources/files/${filename}`);
    if (!res.ok) throw new Error(`Failed to fetch source ${filename}`);
    return res.json();
  }

  async createSourceFile(config: {
    name: string;
    integration_id?: string;
    vars?: Record<string, any>;
  }): Promise<any> {
    // Auto-generate unique hash ID
    const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);

    const source = {
      id,
      name: config.name,
      integration_id: config.integration_id || "",
      config: {},
      vars: config.vars || {},
    };

    const res = await this.request(`/sources`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(source),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || err.message || "Failed to create source");
    }
    return res.json();
  }

  async deleteSourceFile(sourceId: string): Promise<SourceDeleteResponse> {
    const res = await this.request(`/sources/${sourceId}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(`Failed to delete source ${sourceId}`);
    return res.json();
  }

  async getStoredSources(): Promise<any[]> {
    const res = await this.request(`/sources`);
    if (!res.ok) throw new Error("Failed to fetch sources");
    return res.json();
  }

  async updateSourceRefreshInterval(
    sourceId: string,
    intervalMinutes: number | null
  ): Promise<{ source_id: string; refresh_interval_minutes: number | null }> {
    const encodedSourceId = encodeURIComponent(sourceId);
    const res = await this.request(
      `/sources/${encodedSourceId}/refresh-interval`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval_minutes: intervalMinutes }),
      }
    );
    if (!res.ok) {
      const fallback = `Failed to update refresh interval for ${sourceId}`;
      throw new Error(await this.parseErrorMessage(res, fallback));
    }
    return res.json();
  }

  // --- System ---

  async reloadConfig(): Promise<ReloadConfigResponse> {
    const res = await this.request(`/system/reload`, {
      method: "POST",
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      const detail =
        payload &&
        typeof payload === "object" &&
        "detail" in payload &&
        typeof payload.detail === "string"
          ? payload.detail
          : "Failed to reload config";
      const diagnostics =
        payload &&
        typeof payload === "object" &&
        "diagnostics" in payload &&
        Array.isArray(payload.diagnostics)
          ? (payload.diagnostics as ReloadConfigDiagnostic[])
          : [];
      const reloadError = Object.assign(new Error(detail), {
        diagnostics,
        detail,
        status: res.status,
      });
      throw reloadError;
    }
    return res.json();
  }
  // --- System Settings ---

  async getSettings(): Promise<SystemSettings> {
    const res = await this.request(`/settings`);
    if (!res.ok) throw new Error("Failed to fetch settings");
    return res.json();
  }

  async updateSettings(
    settings: SystemSettingsUpdateRequest
  ): Promise<SystemSettings> {
    const res = await this.request(`/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    if (!res.ok) throw new Error("Failed to update settings");
    return res.json();
  }
}

export interface SystemSettings {
  autostart: boolean;
  proxy: string;
  encryption_enabled: boolean;
  encryption_available?: boolean;
  debug_logging_enabled: boolean;
  refresh_interval_minutes: number;
  scraper_timeout_seconds: number;
  theme?: string;
  density?: string;
  language?: "en" | "zh";
}

export type SystemSettingsUpdateRequest = Omit<
  SystemSettings,
  "encryption_available"
>;

export const api = new ApiClient();
