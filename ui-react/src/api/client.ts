import {
  SourceSummary,
  StoredView,
  AuthStatus,
  ViewComponent,
} from "../types/config";

// --- API Client ---

const BASE_URL = "/api";

class ApiClient {
  async getSources(): Promise<SourceSummary[]> {
    const res = await fetch(`${BASE_URL}/sources`);
    if (!res.ok) throw new Error("Failed to fetch sources");
    return res.json();
  }

  async getSourceData(sourceId: string): Promise<any> {
    const res = await fetch(`${BASE_URL}/data/${sourceId}`);
    if (!res.ok) {
      if (res.status === 404) return null;
      throw new Error(`Failed to fetch data for ${sourceId}`);
    }
    return res.json();
  }

  async getHistory(sourceId: string, limit = 100): Promise<any[]> {
    const res = await fetch(
      `${BASE_URL}/data/${sourceId}/history?limit=${limit}`,
    );
    if (!res.ok) return [];
    return res.json();
  }

  async refreshSource(sourceId: string): Promise<void> {
    const res = await fetch(`${BASE_URL}/refresh/${sourceId}`, {
      method: "POST",
    });
    if (!res.ok) throw new Error(`Failed to refresh source ${sourceId}`);
  }

  async refreshAll(): Promise<void> {
    const res = await fetch(`${BASE_URL}/refresh`, { method: "POST" });
    if (!res.ok) throw new Error("Failed to refresh sources");
  }

  // --- Views ---

  async getViews(): Promise<StoredView[]> {
    const res = await fetch(`${BASE_URL}/views`);
    if (!res.ok) throw new Error("Failed to fetch views");
    return res.json();
  }

  async createView(view: StoredView): Promise<StoredView> {
    const res = await fetch(`${BASE_URL}/views`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(view),
    });
    if (!res.ok) throw new Error("Failed to create view");
    return res.json();
  }

  async updateView(viewId: string, view: StoredView): Promise<StoredView> {
    const res = await fetch(`${BASE_URL}/views/${viewId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(view),
    });
    if (!res.ok) throw new Error(`Failed to update view ${viewId}`);
    return res.json();
  }

  async deleteView(viewId: string): Promise<void> {
    const res = await fetch(`${BASE_URL}/views/${viewId}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(`Failed to delete view ${viewId}`);
  }

  // --- Interaction ---

  async interact(sourceId: string, data: Record<string, any>): Promise<void> {
    const res = await fetch(`${BASE_URL}/sources/${sourceId}/interact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Interaction failed for ${sourceId}`);
    }
  }

  async getAuthorizeUrl(
    sourceId: string,
    redirectUri: string,
  ): Promise<{ authorize_url: string }> {
    const params = new URLSearchParams({ redirect_uri: redirectUri });
    const res = await fetch(
      `${BASE_URL}/oauth/authorize/${sourceId}?${params}`,
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Failed to start OAuth for ${sourceId}`);
    }
    return res.json();
  }

  async getAuthStatus(sourceId: string): Promise<AuthStatus> {
    const res = await fetch(`${BASE_URL}/sources/${sourceId}/auth-status`);
    if (!res.ok) throw new Error(`Failed to check auth status for ${sourceId}`);
    return res.json();
  }

  // --- Integration Management ---

  async getIntegrationTemplates(
    integrationId: string,
  ): Promise<ViewComponent[]> {
    const res = await fetch(
      `${BASE_URL}/integrations/${integrationId}/templates`,
    );
    if (!res.ok)
      throw new Error(`Failed to fetch templates for ${integrationId}`);
    return res.json();
  }

  async listIntegrationFiles(): Promise<string[]> {
    const res = await fetch(`${BASE_URL}/integrations/files`);
    if (!res.ok) throw new Error("Failed to fetch integrations");
    return res.json();
  }

  async getIntegrationFile(
    filename: string,
  ): Promise<{ filename: string; content: string }> {
    const res = await fetch(`${BASE_URL}/integrations/files/${filename}`);
    if (!res.ok) throw new Error(`Failed to fetch integration ${filename}`);
    return res.json();
  }

  async createIntegrationFile(
    filename: string,
    content: string = "",
  ): Promise<void> {
    const res = await fetch(
      `${BASE_URL}/integrations/files?filename=${encodeURIComponent(filename)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      },
    );
    if (!res.ok) throw new Error(`Failed to create integration ${filename}`);
  }

  async saveIntegrationFile(filename: string, content: string): Promise<void> {
    const res = await fetch(`${BASE_URL}/integrations/files/${filename}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new Error(`Failed to save integration ${filename}`);
  }

  async deleteIntegrationFile(filename: string): Promise<void> {
    const res = await fetch(`${BASE_URL}/integrations/files/${filename}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(`Failed to delete integration ${filename}`);
  }

  async getIntegrationSources(filename: string): Promise<any[]> {
    const res = await fetch(
      `${BASE_URL}/integrations/files/${filename}/sources`,
    );
    if (!res.ok) throw new Error(`Failed to fetch sources for ${filename}`);
    return res.json();
  }

  // --- Source Management ---

  async listSourceFiles(): Promise<string[]> {
    const res = await fetch(`${BASE_URL}/sources/files`);
    if (!res.ok) throw new Error("Failed to fetch sources");
    return res.json();
  }

  async getSourceFile(
    filename: string,
  ): Promise<{ filename: string; content: string }> {
    const res = await fetch(`${BASE_URL}/sources/files/${filename}`);
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

    const res = await fetch(`${BASE_URL}/sources`, {
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

  async deleteSourceFile(sourceId: string): Promise<void> {
    const res = await fetch(`${BASE_URL}/sources/${sourceId}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(`Failed to delete source ${sourceId}`);
  }

  async getStoredSources(): Promise<any[]> {
    const res = await fetch(`${BASE_URL}/sources`);
    if (!res.ok) throw new Error("Failed to fetch sources");
    return res.json();
  }

  // --- System ---

  async reloadConfig(): Promise<{
    message: string;
    affected_sources: string[];
  }> {
    const res = await fetch(`${BASE_URL}/system/reload`, {
      method: "POST",
    });
    if (!res.ok) throw new Error("Failed to reload config");
    return res.json();
  }
  // --- System Settings ---

  async getSettings(): Promise<SystemSettings> {
    const res = await fetch(`${BASE_URL}/settings`);
    if (!res.ok) throw new Error("Failed to fetch settings");
    return res.json();
  }

  async updateSettings(settings: SystemSettings): Promise<SystemSettings> {
    const res = await fetch(`${BASE_URL}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    if (!res.ok) throw new Error("Failed to update settings");
    return res.json();
  }

  async exportMasterKey(): Promise<{ master_key: string; hint: string }> {
    const res = await fetch(`${BASE_URL}/settings/master-key/export`);
    if (!res.ok) throw new Error("Failed to export master key");
    return res.json();
  }

  async importMasterKey(masterKey: string): Promise<{ message: string }> {
    const res = await fetch(`${BASE_URL}/settings/master-key/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ master_key: masterKey }),
    });
    if (!res.ok) throw new Error("Failed to import master key");
    return res.json();
  }
}

export interface SystemSettings {
  autostart: boolean;
  proxy: string;
  encryption_enabled: boolean;
  master_key?: string | null;
  theme?: string;
}

export const api = new ApiClient();
