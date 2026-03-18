import { expect, test } from "playwright/test";

function sourceSummary(id: string, status: "success" | "suspended" | "error") {
    return {
        id,
        name: `${id}-name`,
        integration_id: "demo",
        status,
        has_data: status === "success",
        message: status === "error" ? "boom" : null,
        error: status === "error" ? "request failed" : null,
        error_details: status === "error" ? "stack trace" : null,
        interaction: status === "suspended" ? { type: "oauth_start" } : null,
    };
}

test.beforeEach(async ({ page }) => {
    await page.route("**/*", async (route) => {
        const request = route.request();
        const method = request.method();
        const url = new URL(request.url());
        const { pathname } = url;

        if (!pathname.startsWith("/api/")) {
            return route.continue();
        }

        if (pathname === "/api/views" && method === "GET") {
            return route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify([
                    {
                        id: "view-1",
                        name: "Main",
                        layout_columns: 12,
                        items: [],
                    },
                ]),
            });
        }

        if (pathname === "/api/sources" && method === "GET") {
            return route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify([
                    sourceSummary("source-ok", "success"),
                    sourceSummary("source-action", "suspended"),
                    sourceSummary("source-fail", "error"),
                ]),
            });
        }

        if (pathname.startsWith("/api/data/") && method === "GET") {
            return route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    data: { value: 42, label: "ok" },
                }),
            });
        }

        if (pathname === "/api/integrations/files/meta" && method === "GET") {
            return route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify([]),
            });
        }

        if (pathname === "/api/integrations/files" && method === "GET") {
            return route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify([]),
            });
        }

        if (pathname === "/api/integrations/presets" && method === "GET") {
            return route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify([
                    {
                        id: "api_key",
                        label: "API Key",
                        description: "HTTP API with bearer token authentication.",
                        filename_hint: "api_key_example",
                        content_template: "name: {{display_name_single_quoted}}\n",
                    },
                    {
                        id: "oauth2",
                        label: "OAuth",
                        description: "Authorization-code OAuth2 flow with API request.",
                        filename_hint: "oauth2_example",
                        content_template: "name: {{display_name_single_quoted}}\n",
                    },
                    {
                        id: "webscraper",
                        label: "Web Scraper",
                        description: "WebView scraping flow with extracted fields.",
                        filename_hint: "webscraper_example",
                        content_template: "name: {{display_name_single_quoted}}\n",
                    },
                    {
                        id: "curl",
                        label: "cURL",
                        description: "Collect request details from a user-provided cURL.",
                        filename_hint: "curl_example",
                        content_template: "name: {{display_name_single_quoted}}\n",
                    },
                ]),
            });
        }

        if (pathname === "/api/settings" && method === "GET") {
            return route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    autostart: false,
                    proxy: "",
                    encryption_enabled: false,
                    encryption_available: true,
                    debug_logging_enabled: false,
                    refresh_interval_minutes: 0,
                    scraper_timeout_seconds: 10,
                }),
            });
        }

        if (method === "POST" || method === "PUT" || method === "DELETE") {
            return route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({ ok: true }),
            });
        }

        return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({}),
        });
    });
});

test("dashboard renders mocked source statuses", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("看板")).toBeVisible();
    await expect(page.getByText("数据源状态")).toBeVisible();
    await expect(page.getByText("source-ok-name")).toBeVisible();
    await expect(page.getByText("source-action-name")).toBeVisible();
    await expect(page.getByText("source-fail-name")).toBeVisible();
});

test("integration creation dialog shows release presets", async ({ page }) => {
    await page.goto("/integrations");

    await page.getByRole("button", { name: "New Integration" }).click();
    await expect(page.getByText("Presets")).toBeVisible();
    await expect(page.getByRole("button", { name: "API Key" })).toBeVisible();
    await expect(page.getByRole("button", { name: "OAuth" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Web Scraper" })).toBeVisible();
    await expect(page.getByRole("button", { name: "cURL" })).toBeVisible();
});

test("settings about tab exposes manual bug report action", async ({ page }) => {
    await page.goto("/settings");

    await page.getByRole("tab", { name: "关于" }).click();
    await expect(page.getByRole("button", { name: "Report Bug" })).toBeVisible();
});
