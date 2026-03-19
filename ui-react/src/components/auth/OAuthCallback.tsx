import { useEffect, useState, useRef } from "react";
import { api } from "../../api/client";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

const OAUTH_PENDING_SOURCE_ID_KEY = "oauth_pending_source_id";

export function OAuthCallback() {
  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [message, setMessage] = useState("Authenticating...");

  // Prevent StrictMode double invocation
  const callbackRef = useRef(false);

  useEffect(() => {
    if (callbackRef.current) return;
    callbackRef.current = true;

    const handleCallback = async () => {
      const params = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const queryPayload = Object.fromEntries(params.entries());
      const hashPayload = Object.fromEntries(hash.entries());
      const code = params.get("code");
      const error = params.get("error");
      const accessToken = hash.get("access_token");
      const tokenType = hash.get("token_type");
      const expiresIn = hash.get("expires_in");
      const scope = hash.get("scope");
      const hashState = hash.get("state");
      const pendingSourceId = (() => {
        try {
          return window.localStorage.getItem(OAUTH_PENDING_SOURCE_ID_KEY) || undefined;
        } catch (_e) {
          return undefined;
        }
      })();

      if (error) {
        setStatus("error");
        setMessage(`Authorization failed: ${error}`);
        return;
      }

      if (
        !code &&
        Object.keys(queryPayload).length === 0 &&
        Object.keys(hashPayload).length === 0
      ) {
        setStatus("error");
        setMessage("Missing authorization payload");
        return;
      }

      try {
        // Determine redirect_uri (current URL without query)
        const redirectUri = window.location.origin + window.location.pathname;
        const payload =
          code || Object.keys(queryPayload).length > 0
            ? {
                type: "oauth_code_exchange",
                ...queryPayload,
                code: code ?? undefined,
                redirect_uri: redirectUri,
              }
            : {
                type: "oauth_implicit_token",
                oauth_payload: hashPayload,
                access_token: accessToken ?? undefined,
                token_type: tokenType ?? "Bearer",
                expires_in: expiresIn ? Number(expiresIn) : undefined,
                scope: scope ?? undefined,
                state: hashState ?? undefined,
              };

        const result = await api.oauthCallbackInteract(payload);
        const sourceId = result.source_id || pendingSourceId;
        if (!sourceId) {
          throw new Error("OAuth callback did not return source ID");
        }
        if (pendingSourceId) {
          try {
            window.localStorage.removeItem(OAUTH_PENDING_SOURCE_ID_KEY);
          } catch (_e) {
            // Ignore localStorage errors.
          }
        }

        setStatus("success");
        setMessage("Authorization successful! You can close this window.");

        // Notify parent window via BroadcastChannel
        const channel = new BroadcastChannel("oauth_channel");
        channel.postMessage({ type: "success", sourceId });
        channel.close();

        // Auto close after 2 seconds
        setTimeout(() => {
          window.close();
        }, 2000);
      } catch (err: any) {
        setStatus("error");
        setMessage(err.message || "Failed to exchange token");
      }
    };

    handleCallback();

    // No cleanup - prevent StrictMode double invocation by never resetting the flag
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <Card className="w-[400px]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {status === "loading" && (
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            )}
            {status === "success" && (
              <CheckCircle className="h-6 w-6 text-green-500" />
            )}
            {status === "error" && <XCircle className="h-6 w-6 text-red-500" />}
            OAuth Authorization
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">{message}</p>
          {status !== "loading" && (
            <Button
              className="w-full"
              onClick={() => window.close()}
              variant={status === "error" ? "destructive" : "default"}
            >
              Close Window
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
