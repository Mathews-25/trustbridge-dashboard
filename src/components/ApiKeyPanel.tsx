"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { Copy, KeyRound, Loader2, Trash2 } from "lucide-react";

import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  KeyRound,
  Loader2,
  Trash2,
} from "lucide-react";
import { useId, useRef, useState } from "react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { VALID_SCOPES, type ApiKeyScope } from "@/app/api/settings/api-keys/route";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { API_KEY_SCOPE_DEFINITIONS, ApiKeyScope } from "@/lib/api-key-scopes";
import { formatRelativeTime } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ApiKeyRow {
  id: string;
  name: string;
  scopes: string[];
  createdAt: string;
  revokedAt: string | null;
}

interface CreateResponse {
  apiKey: ApiKeyRow;
  rawKey: string;
}

interface ListResponse {
  keys: ApiKeyRow[];
}

// ---------------------------------------------------------------------------
// ApiKeyPanel
// ---------------------------------------------------------------------------

export function ApiKeyPanel() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();

  // Form state
  const [keyName, setKeyName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<Set<ApiKeyScope>>(
    new Set()
  );

  // One-time secret state — cleared when the user dismisses.
  const [revealedSecret, setRevealedSecret] = useState<{
    keyName: string;
    rawKey: string;
  } | null>(null);

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const isMaintainer = session?.user?.isMaintainer === true;

  // -------------------------------------------------------------------------
  // Queries / mutations
  // -------------------------------------------------------------------------

  const listQuery = useQuery<ListResponse>({
    queryKey: ["api-keys"],
    queryFn: async () => {
      const res = await fetch("/api/settings/api-keys");
      if (!res.ok) throw new Error("Failed to load API keys");
      return res.json() as Promise<ListResponse>;
    },
    enabled: isMaintainer,
  });

  const createMutation = useMutation<CreateResponse, Error, void>({
  expiresAt: string | null;
  lastUsedAt: string | null;
}

interface CreateResponse {
  key: ApiKeyRow & { secret: string };
  warning: string;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function ScopeChip({ scope }: { scope: string }) {
  const definition = API_KEY_SCOPE_DEFINITIONS[scope as ApiKeyScope];
  const tooltip = definition
    ? `${scope} — bit ${definition.bit} (mask ${definition.mask}): ${definition.description}`
    : `${scope} — unrecognized scope`;

  return (
    <Badge
      variant="secondary"
      className="font-mono text-xs"
      title={tooltip}
      aria-label={tooltip}
      data-testid={`api-key-scope-${scope}`}
    >
      {scope}
    </Badge>
  );
}

function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <span className="text-xs text-muted-foreground">
      <span className="font-medium">{label}:</span> {value}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Secret reveal banner (shown once after creation)
// ---------------------------------------------------------------------------

function SecretBanner({
  secret,
  onDismiss,
}: {
  secret: string;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Clipboard API unavailable — user can still select + copy manually.
    }
  }

  return (
    <div
      role="alert"
      className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm dark:border-emerald-700 dark:bg-emerald-950/40"
      data-testid="secret-banner"
    >
      <div className="mb-2 flex items-center gap-2 font-semibold text-emerald-800 dark:text-emerald-200">
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
        API key created — copy it now
      </div>
      <p className="mb-3 text-emerald-700 dark:text-emerald-300">
        This secret will <strong>not</strong> be shown again. Store it in your
        CI/CD secret store (e.g. GitHub Actions secrets) before closing this
        banner.
      </p>
      <div className="flex items-center gap-2">
        <code
          className="flex-1 overflow-x-auto rounded border border-emerald-200 bg-white px-3 py-2 font-mono text-xs text-foreground dark:border-emerald-700 dark:bg-background"
          aria-label="API key secret"
          data-testid="secret-value"
        >
          {secret}
        </code>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleCopy}
          aria-label={copied ? "Copied" : "Copy API key to clipboard"}
          data-testid="copy-secret"
        >
          {copied ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          ) : (
            <ClipboardCopy className="h-4 w-4" aria-hidden="true" />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-3 text-xs text-emerald-700 underline underline-offset-2 dark:text-emerald-300"
        data-testid="dismiss-secret"
      >
        I&apos;ve saved it — dismiss
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create form
// ---------------------------------------------------------------------------

function CreateKeyForm({ onCreated }: { onCreated: (secret: string) => void }) {
  const nameId = useId();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/settings/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: keyName.trim(), scopes: [...selectedScopes] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Create failed");
      return data as CreateResponse;
    },
    onSuccess: (data) => {
      setRevealedSecret({ keyName: data.apiKey.name, rawKey: data.rawKey });
      setKeyName("");
      setSelectedScopes(new Set());
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });

  const revokeMutation = useMutation<void, Error, string>({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/settings/api-keys/${id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Revoke failed");
    },
    onSuccess: () => {
      setRevokeError(null);
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (err) => {
      setRevokeError(err.message);
    },
  });

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function toggleScope(scope: ApiKeyScope) {
    setSelectedScopes((prev) => {
      const next = new Set(prev);
      next.has(scope) ? next.delete(scope) : next.add(scope);
      return next;
    });
  }

  async function copyToClipboard(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (!isMaintainer) {
    return (
      <Card data-testid="api-key-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            API Keys
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p
            className="text-sm text-muted-foreground"
            data-testid="maintainer-only-message"
          >
            API key management is available to maintainers only.
          </p>
        </CardContent>
      </Card>
    );
  }
        body: JSON.stringify({ name: name.trim(), scopes: ["export:read"] }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error((payload as { error?: string }).error ?? "Failed to create key");
      }
      return res.json() as Promise<CreateResponse>;
    },
    onSuccess: (data) => {
      setName("");
      setError(null);
      void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
      onCreated(data.key.secret);
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setError(null);
    mutation.mutate();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3" aria-label="Create API key">
      <div className="space-y-1.5">
        <Label htmlFor={nameId}>Key name</Label>
        <Input
          id={nameId}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. nightly-export-cron"
          maxLength={80}
          disabled={mutation.isPending}
          autoComplete="off"
          data-testid="api-key-name-input"
        />
        <p className="text-xs text-muted-foreground">
          Scope: <code
            className="font-mono"
            title="Bit 0 (mask 1): read contributor export endpoints; does not allow writes."
          >export:read</code> — read-only access
          to contributor export endpoints.
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="text-sm text-destructive"
          data-testid="create-key-error"
        >
          {error}
        </p>
      )}

      <Button
        type="submit"
        disabled={mutation.isPending || !name.trim()}
        data-testid="create-key-submit"
      >
        {mutation.isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Creating…
          </>
        ) : (
          <>
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            Create key
          </>
        )}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Key row
// ---------------------------------------------------------------------------

function KeyRow({ apiKey }: { apiKey: ApiKeyRow }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const revokeButtonRef = useRef<HTMLButtonElement>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/settings/api-keys/${apiKey.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error((payload as { error?: string }).error ?? "Failed to revoke key");
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });

  const isExpired = apiKey.expiresAt ? new Date(apiKey.expiresAt) < new Date() : false;

  return (
    <>
      <li
        className="flex flex-wrap items-start justify-between gap-3 py-4 text-sm"
        data-testid={`api-key-row-${apiKey.id}`}
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{apiKey.name}</span>
            {isExpired && (
              <Badge variant="destructive" className="text-xs">
                Expired
              </Badge>
            )}
            {apiKey.scopes.map((s) => (
              <ScopeChip key={s} scope={s} />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5">
            <StatusLine
              label="Created"
              value={formatRelativeTime(apiKey.createdAt)}
            />
            {apiKey.lastUsedAt ? (
              <StatusLine
                label="Last used"
                value={formatRelativeTime(apiKey.lastUsedAt)}
              />
            ) : (
              <StatusLine label="Last used" value="Never" />
            )}
            {apiKey.expiresAt && (
              <StatusLine
                label={isExpired ? "Expired" : "Expires"}
                value={formatRelativeTime(apiKey.expiresAt)}
              />
            )}
          </div>
        </div>

        <Button
          ref={revokeButtonRef}
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setConfirmOpen(true)}
          disabled={mutation.isPending}
          aria-label={`Revoke API key "${apiKey.name}"`}
          data-testid={`revoke-key-${apiKey.id}`}
        >
          {mutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          )}
          Revoke
        </Button>
      </li>

      <ConfirmDialog
        open={confirmOpen}
        title="Revoke API key?"
        description={
          <>
            The key <strong>&quot;{apiKey.name}&quot;</strong> will stop working
            immediately. Any cron job or script using it will fail until you
            update it with a new key.
          </>
        }
        warning="This action cannot be undone."
        confirmLabel="Revoke key"
        destructive
        pending={mutation.isPending}
        onConfirm={() => {
          mutation.mutate();
          setConfirmOpen(false);
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

/**
 * API key management panel for the maintainer settings page.
 *
 * Lets operator+ maintainers create and revoke hashed API keys scoped to
 * `export:read`. The raw secret is shown once after creation inside a
 * highlighted banner with a copy button; after dismissal or page reload it
 * is gone.
 */
export function ApiKeyPanel() {
  const [pendingSecret, setPendingSecret] = useState<string | null>(null);

  const keysQuery = useQuery<{ keys: ApiKeyRow[] }>({
    queryKey: ["api-keys"],
    queryFn: async () => {
      const res = await fetch("/api/settings/api-keys");
      if (!res.ok) throw new Error("Failed to load API keys");
      return res.json() as Promise<{ keys: ApiKeyRow[] }>;
    },
  });

  return (
    <Card data-testid="api-key-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5" />
          API Keys
        </CardTitle>
        <CardDescription>
          Manage maintainer API keys for treasury export automation.
          <KeyRound className="h-5 w-5" aria-hidden="true" />
          API keys
        </CardTitle>
        <CardDescription>
          Machine credentials for cron export automation. Keys carry the{" "}
          <code className="font-mono text-xs">export:read</code> scope and
          authenticate against{" "}
          <code className="font-mono text-xs">/api/contributors/export/*</code>{" "}
          without a browser session. Store secrets in your CI/CD secret store —
          they are shown once at creation.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* ---- One-time secret banner ---- */}
        {revealedSecret && (
          <div
            className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 space-y-2"
            data-testid="raw-key-banner"
          >
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
              Copy your new API key now — it will not be shown again.
            </p>
            <div className="flex items-center gap-2">
              <code
                className="flex-1 truncate rounded bg-black/10 px-2 py-1 text-xs font-mono dark:bg-white/10"
                data-testid="raw-key-value"
              >
                {revealedSecret.rawKey}
              </code>
              <Button
                size="sm"
                variant="outline"
                data-testid="copy-raw-key-button"
                onClick={() =>
                  copyToClipboard(revealedSecret.rawKey, "raw")
                }
              >
                <Copy className="h-4 w-4" />
                {copiedId === "raw" ? "Copied!" : "Copy"}
              </Button>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="text-xs"
              data-testid="dismiss-raw-key-button"
              onClick={() => setRevealedSecret(null)}
            >
              I&apos;ve saved it — dismiss
            </Button>
          </div>
        )}

        {/* ---- Create form ---- */}
        <div className="space-y-3" data-testid="create-api-key-form">
          <h3 className="text-sm font-semibold">Create new API key</h3>

          <div className="flex flex-col gap-1">
            <label htmlFor="api-key-name" className="text-xs text-muted-foreground">
              Key name <span aria-hidden="true">*</span>
            </label>
            <input
              id="api-key-name"
              data-testid="api-key-name-input"
              type="text"
              placeholder="e.g. Treasury Export Bot"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              className="rounded border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Scope checkboxes */}
          <div className="space-y-1" data-testid="scope-checkboxes">
            <p className="text-xs text-muted-foreground">Scopes</p>
            {VALID_SCOPES.map((scope) => (
              <label key={scope} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  data-testid={`scope-checkbox-${scope}`}
                  checked={selectedScopes.has(scope)}
                  onChange={() => toggleScope(scope)}
                  className="accent-stellar-cyan"
                />
                {scope}
              </label>
            ))}
          </div>

          {createMutation.isError && (
            <p className="text-sm text-destructive" data-testid="create-error">
              {createMutation.error.message}
            </p>
          )}

          <Button
            variant="stellar"
            size="sm"
            data-testid="create-api-key-button"
            disabled={!keyName.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating…
              </>
            ) : (
              "Create API key"
            )}
          </Button>
        </div>

        {/* ---- Key list ---- */}
        <div data-testid="api-key-list">
          <h3 className="mb-2 text-sm font-semibold">Existing keys</h3>

          {listQuery.isLoading && (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}

          {revokeError && (
            <p className="mb-2 text-sm text-destructive" data-testid="revoke-error">
              {revokeError}
            </p>
          )}

          {listQuery.data?.keys.length === 0 && (
            <p className="text-sm text-muted-foreground">No API keys yet.</p>
          )}

          <ul className="space-y-2">
            {listQuery.data?.keys.map((key) => (
              <li
                key={key.id}
                data-testid={`api-key-row-${key.id}`}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{key.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {key.scopes.join(", ") || "no scopes"}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {key.revokedAt ? (
                    <span
                      className="rounded-full bg-destructive/20 px-2 py-0.5 text-xs text-destructive"
                      data-testid={`revoked-badge-${key.id}`}
                    >
                      Revoked
                    </span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      data-testid={`revoke-button-${key.id}`}
                      disabled={revokeMutation.isPending}
                      onClick={() => revokeMutation.mutate(key.id)}
                      aria-label={`Revoke ${key.name}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        {/* Secret reveal banner — shown immediately after creation */}
        {pendingSecret && (
          <SecretBanner
            secret={pendingSecret}
            onDismiss={() => setPendingSecret(null)}
          />
        )}

        {/* Create form */}
        <CreateKeyForm onCreated={(secret) => setPendingSecret(secret)} />

        {/* Divider */}
        <div className="border-t border-border" aria-hidden="true" />

        {/* Key list */}
        <div>
          <h3 className="mb-3 text-sm font-medium">Active keys</h3>

          {keysQuery.isLoading ? (
            <div
              className="flex items-center gap-2 py-4 text-sm text-muted-foreground"
              role="status"
            >
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Loading keys…
            </div>
          ) : keysQuery.isError ? (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              data-testid="api-keys-error"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              Failed to load API keys.
            </div>
          ) : !keysQuery.data || keysQuery.data.keys.length === 0 ? (
            <p
              className="text-sm text-muted-foreground"
              data-testid="api-keys-empty"
            >
              No active API keys. Create one above to enable cron exports.
            </p>
          ) : (
            <ul
              className="divide-y divide-border"
              aria-label="Active API keys"
              data-testid="api-keys-list"
            >
              {keysQuery.data.keys.map((key) => (
                <KeyRow key={key.id} apiKey={key} />
              ))}
            </ul>
          )}
        </div>

        {/* Info callout */}
        <div className="flex gap-2 rounded-lg border border-border bg-muted/40 px-3 py-3 text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <p>
            Keys are hashed at rest — TrustBridge never stores the raw secret.
            If you lose a key, revoke it and create a new one. Rate limiting
            applies: 60 requests per minute per IP.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
