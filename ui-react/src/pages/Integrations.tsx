import { useEffect, useState, useCallback, useRef, type ComponentType } from "react";
import Editor from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import type * as Monaco from "monaco-editor";
import { api } from "../api/client";
import type {
    IntegrationPresetResponse,
    ReloadConfigDiagnostic,
    IntegrationFileMetadata,
    ReloadConfigResponse,
} from "../api/client";
import { useStore } from "../store";
import {
    useIntegrationFiles,
    useIntegrationPresets,
    useIntegrationMetadata,
    invalidateViews,
    invalidateSources,
} from "../hooks/useSWR";
import {
    Card,
    CardContent,
} from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "../components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "../components/ui/tooltip";
import {
    Plus,
    Trash2,
    Save,
    MoreVertical,
    Sparkles,
    Copy,
    ExternalLink,
    FileJson,
    Database,
    AlertCircle,
    AlertTriangle,
    CheckCircle,
    ChevronLeft,
    ChevronRight,
    Globe,
    Key,
    Lock,
    Terminal,
    RefreshCw,
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import { useTheme } from "../components/theme-provider";
import { openExternalLink } from "../lib/utils";
import {
    markersToDiagnostics,
    setupYamlWorker,
    type IntegrationDiagnostic,
} from "../components/editor/YamlEditorWorkerSetup";
import { resolveDiagnosticSeverity } from "../components/editor/integrationDiagnostics";
import { RouteInterceptor } from "../components/RouteInterceptor";
import { EmptyState } from "../components/EmptyState";
import { InlineError } from "../components/InlineError";
import { INTEGRATION_EDITOR_PROMPT } from "../constants/integrationSkillPrompt";
import { useI18n, type Translate } from "../i18n";

type ReloadConfigError = Error & {
    diagnostics?: ReloadConfigDiagnostic[];
    detail?: string;
};

function normalizeIntegrationFilename(input: string): string {
    return input.trim();
}

function stripYamlExtension(input: string): string {
    const trimmed = input.trim();
    return trimmed.toLowerCase().endsWith(".yaml")
        ? trimmed.slice(0, -5)
        : trimmed;
}

function toYamlSingleQuoted(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

type IntegrationPreset = {
    id: string;
    label: string;
    description: string;
    filenameHint: string;
    contentTemplate: string;
    icon: ComponentType<{ className?: string }>;
};

const PRESET_ICON_BY_ID: Record<string, ComponentType<{ className?: string }>> = {
    api_key: Key,
    oauth2: Lock,
    curl: Terminal,
    webscraper: Globe,
};
const SKILLS_GITHUB_URL = "https://github.com/Evoltonnac/glanceus/tree/main/skills";

function normalizePresetResponse(preset: IntegrationPresetResponse): IntegrationPreset {
    return {
        id: preset.id,
        label: preset.label,
        description: preset.description,
        filenameHint: preset.filename_hint,
        contentTemplate: preset.content_template,
        icon: PRESET_ICON_BY_ID[preset.id] ?? FileJson,
    };
}

function renderPresetContent(template: string, displayName: string): string {
    const safeSingleQuoted = toYamlSingleQuoted(displayName);
    return template
        .replaceAll("{{display_name_single_quoted}}", safeSingleQuoted)
        .replaceAll("{{display_name}}", displayName);
}

function unique(values: string[]): string[] {
    return Array.from(new Set(values));
}

function buildReloadToastMessage(
    t: Translate,
    action: "save" | "reload",
    result: ReloadConfigResponse,
    focusFile: string | null,
): string {
    const targetFilename = focusFile
        ? normalizeIntegrationFilename(focusFile)
        : null;
    const changedFiles = result.changed_files ?? [];
    const focusedChanges = targetFilename
        ? changedFiles.filter(
            (item) =>
                normalizeIntegrationFilename(item.filename) === targetFilename,
        )
        : changedFiles;
    const scopedChanges = focusedChanges.length > 0 ? focusedChanges : changedFiles;

    if (scopedChanges.length === 0) {
        return action === "save"
            ? t("integrations.reload.save_ok")
            : t("integrations.reload.no_change");
    }

    const logicChanges = scopedChanges.filter(
        (item) => item.change_scope === "logic",
    );
    const viewChanges = scopedChanges.filter(
        (item) => item.change_scope === "view",
    );
    const autoRefreshedSources = unique(
        scopedChanges.flatMap((item) => item.auto_refreshed_sources ?? []),
    );
    const prefix =
        action === "save"
            ? t("integrations.reload.save_prefix")
            : t("integrations.reload.reload_prefix");

    if (logicChanges.length > 0) {
        const logicFiles = logicChanges.map((item) => item.filename).join(", ");
        const refreshText =
            autoRefreshedSources.length > 0
                ? t("integrations.reload.logic_refresh_count", {
                      count: autoRefreshedSources.length,
                  })
                : t("integrations.reload.logic_refresh_none");
        if (viewChanges.length > 0) {
            return (
                prefix +
                t("integrations.reload.logic_with_view", {
                    files: logicFiles,
                    refreshText,
                    count: viewChanges.length,
                })
            );
        }
        return (
            prefix +
            t("integrations.reload.logic_only", {
                files: logicFiles,
                refreshText,
            })
        );
    }

    const viewFiles = viewChanges.map((item) => item.filename).join(", ");
    return prefix + t("integrations.reload.view_only", { files: viewFiles });
}

function DiagnosticItem({ diagnostic }: { diagnostic: IntegrationDiagnostic }) {
    const { t } = useI18n();
    const [expanded, setExpanded] = useState(false);
    const isWarning = diagnostic.severity === "warning";
    const containerClass = isWarning
        ? "rounded-md border border-warning/20 bg-warning/5 px-3 py-2 text-xs mb-2"
        : "rounded-md border border-error/20 bg-background/80 px-3 py-2 text-xs mb-2";
    const iconClass = isWarning
        ? "h-3.5 w-3.5 text-warning flex-shrink-0"
        : "h-3.5 w-3.5 text-error flex-shrink-0";
    const detailClass = isWarning
        ? "mt-2 text-muted-foreground pl-5 border-l-2 border-warning/30 ml-1.5 space-y-1"
        : "mt-2 text-muted-foreground pl-5 border-l-2 border-error/20 ml-1.5 space-y-1";
    const locationPrefix =
        diagnostic.line && diagnostic.column
            ? `l:${diagnostic.line},c:${diagnostic.column} `
            : "";
    return (
        <div className={containerClass}>
            <div
                className="font-medium text-foreground cursor-pointer flex justify-between items-center"
                onClick={() => setExpanded(!expanded)}
            >
                <div className="flex items-center gap-2 truncate pr-2">
                    {isWarning ? (
                        <AlertTriangle className={iconClass} />
                    ) : (
                        <AlertCircle className={iconClass} />
                    )}
                    <span className="truncate">
                        {locationPrefix && (
                            <span className="text-muted-foreground">
                                {locationPrefix}
                            </span>
                        )}
                        {diagnostic.message}
                    </span>
                </div>
                <ChevronRight
                    className={`h-4 w-4 flex-shrink-0 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
                />
            </div>
            {expanded && (
                <div className={detailClass}>
                    <p>
                        {diagnostic.line && diagnostic.column
                            ? t("integrations.diagnostic.location", {
                                  line: diagnostic.line,
                                  column: diagnostic.column,
                              })
                            : t("integrations.diagnostic.no_position")}
                    </p>
                    {diagnostic.fieldPath && (
                        <p>
                            {t("integrations.diagnostic.field", {
                                value: diagnostic.fieldPath,
                            })}
                        </p>
                    )}
                    {diagnostic.code && (
                        <p>
                            {t("integrations.diagnostic.code", {
                                value: diagnostic.code,
                            })}
                        </p>
                    )}
                    <p>
                        {t("integrations.diagnostic.source", {
                            value: diagnostic.source,
                        })}
                    </p>
                </div>
            )}
        </div>
    );
}

export default function IntegrationsPage() {
    useTheme(); // Ensure context is used if needed, or simply remove
    const { t } = useI18n();
    const [isDarkTheme, setIsDarkTheme] = useState(false);

    useEffect(() => {
        const checkDark = () =>
            document.documentElement.classList.contains("dark");
        setIsDarkTheme(checkDark());

        const observer = new MutationObserver(() => {
            setIsDarkTheme(checkDark());
        });
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class"],
        });

        return () => observer.disconnect();
    }, []);

    const {
        integrationsSelectedFile: selectedFile,
        setIntegrationsSelectedFile: setSelectedFile,
        integrationsSidebarCollapsed: sidebarCollapsed,
        setIntegrationsSidebarCollapsed: setSidebarCollapsed,
    } = useStore();
    const showToast = useStore((state) => state.showToast);

    const [integrations, setIntegrations] = useState<string[]>([]);
    const [content, setContent] = useState<string>("");
    const [originalContent, setOriginalContent] = useState<string>("");
    const [selectedFilePath, setSelectedFilePath] = useState<string | null>(
        null,
    );
    const [saving, setSaving] = useState(false);
    const [editorError, setEditorError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [backendDiagnosticsByFile, setBackendDiagnosticsByFile] = useState<
        Record<string, IntegrationDiagnostic[]>
    >({});
    const [editorDiagnosticsByFile, setEditorDiagnosticsByFile] = useState<
        Record<string, IntegrationDiagnostic[]>
    >({});

    // Source management
    const [sources, setSources] = useState<any[]>([]);
    const [selectedIntegrationIds, setSelectedIntegrationIds] = useState<
        string[]
    >([]);

    // Dialogs
    const [showNewIntegrationDialog, setShowNewIntegrationDialog] =
        useState(false);
    const [newIntegrationDialogView, setNewIntegrationDialogView] = useState<
        "create" | "ai-prompt"
    >("create");
    const [showNewSourceDialog, setShowNewSourceDialog] = useState(false);
    const [newIntegrationError, setNewIntegrationError] = useState<
        string | null
    >(null);
    const [newSourceError, setNewSourceError] = useState<string | null>(null);
    const [newFilename, setNewFilename] = useState("");
    const [newIntegrationName, setNewIntegrationName] = useState("");
    const [selectedPresetId, setSelectedPresetId] = useState<string | null>(
        null,
    );
    const [integrationPresets, setIntegrationPresets] = useState<
        IntegrationPreset[]
    >([]);
    const [newSourceName, setNewSourceName] = useState("");
    const [integrationDisplayNameByFile, setIntegrationDisplayNameByFile] =
        useState<Record<string, string>>({});

    const [deletingIntegration, setDeletingIntegration] = useState<
        string | null
    >(null);
    const [deleteIntegrationError, setDeleteIntegrationError] = useState<
        string | null
    >(null);
    const [deletingSourceId, setDeletingSourceId] = useState<string | null>(
        null,
    );
    const [deleteSourceError, setDeleteSourceError] = useState<string | null>(
        null,
    );
    const [diagnosticsExpanded, setDiagnosticsExpanded] = useState(false);

    const activeFileRef = useRef<string | null>(selectedFile);
    const validateDebounceRef = useRef<number | null>(null);

    useEffect(() => {
        activeFileRef.current = selectedFile;
    }, [selectedFile]);

    const getFileDiagnostics = useCallback(
        (filename: string): IntegrationDiagnostic[] => {
            const backend = backendDiagnosticsByFile[filename] ?? [];
            const editor = editorDiagnosticsByFile[filename] ?? [];
            return [...backend, ...editor];
        },
        [backendDiagnosticsByFile, editorDiagnosticsByFile],
    );

    const getFileDiagnosticSummary = useCallback(
        (filename: string): { errorCount: number; warningCount: number } => {
            const diagnostics = getFileDiagnostics(filename);
            return diagnostics.reduce(
                (summary, diagnostic) => {
                    if (diagnostic.severity === "warning") {
                        summary.warningCount += 1;
                    } else {
                        summary.errorCount += 1;
                    }
                    return summary;
                },
                { errorCount: 0, warningCount: 0 },
            );
        },
        [getFileDiagnostics],
    );

    const selectedDiagnostics = selectedFile
        ? getFileDiagnostics(selectedFile)
        : [];
    const selectedErrorDiagnostics = selectedDiagnostics.filter(
        (diagnostic) => diagnostic.severity === "error",
    );
    const selectedWarningDiagnostics = selectedDiagnostics.filter(
        (diagnostic) => diagnostic.severity === "warning",
    );
    const selectedHasBlockingErrors = selectedErrorDiagnostics.length > 0;

    useEffect(() => {
        if (selectedDiagnostics.length > 0) {
            setDiagnosticsExpanded(true);
        } else {
            setDiagnosticsExpanded(false);
        }
    }, [selectedDiagnostics.length]);

    useEffect(() => {
        return () => {
            if (validateDebounceRef.current !== null) {
                window.clearTimeout(validateDebounceRef.current);
            }
        };
    }, []);

    const hasFileErrors = useCallback(
        (filename: string) =>
            getFileDiagnosticSummary(filename).errorCount > 0,
        [getFileDiagnosticSummary],
    );
    const hasFileWarnings = useCallback(
        (filename: string) => {
            const summary = getFileDiagnosticSummary(filename);
            return summary.errorCount === 0 && summary.warningCount > 0;
        },
        [getFileDiagnosticSummary],
    );

    const editorModelPath = selectedFile
        ? `file:///integrations/${selectedFile}`
        : undefined;

    const handleEditorValidate = useCallback((markers: editor.IMarker[]) => {
        const currentFile = activeFileRef.current;
        if (!currentFile) {
            return;
        }
        if (validateDebounceRef.current !== null) {
            window.clearTimeout(validateDebounceRef.current);
        }
        validateDebounceRef.current = window.setTimeout(() => {
            setEditorDiagnosticsByFile((prev) => ({
                ...prev,
                [currentFile]: markersToDiagnostics(markers),
            }));
        }, 220);
    }, []);

    const mapBackendDiagnostics = useCallback(
        (
            fallbackFile: string,
            diagnostics: ReloadConfigDiagnostic[] | undefined,
            fallbackMessage: string,
        ): Record<string, IntegrationDiagnostic[]> => {
            if (!diagnostics || diagnostics.length === 0) {
                return {
                    [fallbackFile]: [
                        {
                            source: "backend",
                            message: fallbackMessage,
                            code: "reload.error",
                            severity: "error",
                        },
                    ],
                };
            }

            const grouped: Record<string, IntegrationDiagnostic[]> = {};
            diagnostics.forEach((diagnostic) => {
                const targetFile = diagnostic.file
                    ? normalizeIntegrationFilename(diagnostic.file)
                    : fallbackFile;
                if (!grouped[targetFile]) {
                    grouped[targetFile] = [];
                }
                grouped[targetFile].push({
                    source: "backend",
                    message: diagnostic.message || fallbackMessage,
                    code: diagnostic.code,
                    line: diagnostic.line,
                    column: diagnostic.column,
                    fieldPath: diagnostic.field_path ?? diagnostic.fieldPath,
                    severity: resolveDiagnosticSeverity({
                        code: diagnostic.code,
                        message: diagnostic.message || fallbackMessage,
                    }),
                });
            });
            return grouped;
        },
        [],
    );

    const clearBackendDiagnosticsForFile = useCallback((filename: string) => {
        setBackendDiagnosticsByFile((prev) => {
            if (!prev[filename]) {
                return prev;
            }
            const next = { ...prev };
            delete next[filename];
            return next;
        });
    }, []);

    const loadIntegrations = useCallback(async () => {
        try {
            const files = await api.listIntegrationFiles();
            setIntegrations(files);
            try {
                const metadata = await api.listIntegrationFileMetadata();
                const nextNames: Record<string, string> = {};
                metadata.forEach((item) => {
                    const name = item.name?.trim();
                    if (name) {
                        nextNames[item.filename] = name;
                    }
                });
                setIntegrationDisplayNameByFile(nextNames);
            } catch (metadataErr) {
                console.warn(
                    "Failed to load integration metadata:",
                    metadataErr,
                );
                setIntegrationDisplayNameByFile((prev) => {
                    const next: Record<string, string> = {};
                    files.forEach((file) => {
                        if (prev[file]) {
                            next[file] = prev[file];
                        }
                    });
                    return next;
                });
            }
        } catch (err) {
            console.error("Failed to load integrations:", err);
        }
    }, []);

    const loadIntegrationContent = useCallback(async (filename: string) => {
        try {
            const data = await api.getIntegrationFile(filename);
            setSelectedFile(data.filename);
            setContent(data.content);
            setOriginalContent(data.content);
            setSelectedIntegrationIds(data.integration_ids ?? []);
            setSelectedFilePath(data.resolved_path ?? null);
            setIntegrationDisplayNameByFile((prev) => {
                const next = { ...prev };
                const name = data.display_name?.trim();
                if (name) {
                    next[data.filename] = name;
                } else {
                    delete next[data.filename];
                }
                return next;
            });
            setEditorError(null);

            // Load related sources
            const relatedSources = await api.getIntegrationSources(
                data.filename,
            );
            setSources(relatedSources);
            return data;
        } catch (err) {
            setEditorError(t("integrations.error.load_file", { file: filename }));
            console.error(err);
            return null;
        }
    }, [t]);

    const handleReloadFile = useCallback(async () => {
        const targetFile = selectedFile;
        const previousContent = content;
        setEditorError(null);
        setSuccess(null);
        let loadedFilename: string | null = null;
        let fileContentUpdated = false;

        if (targetFile) {
            const data = await loadIntegrationContent(targetFile);
            if (!data) {
                showToast(
                    t("integrations.toast.reload_failed_file", {
                        file: targetFile,
                    }),
                    "error",
                );
            } else {
                loadedFilename = data.filename;
                fileContentUpdated = data.content !== previousContent;
            }
        }

        try {
            const reloadResult = await api.reloadConfig();
            await loadIntegrations();
            const resolvedFocusFile = loadedFilename ?? targetFile;
            if (resolvedFocusFile) {
                clearBackendDiagnosticsForFile(resolvedFocusFile);
            }
            await invalidateViews();
            if ((reloadResult.auto_refreshed_sources ?? []).length > 0) {
                await invalidateSources();
            }

            let message = buildReloadToastMessage(
                t,
                "reload",
                reloadResult,
                resolvedFocusFile,
            );
            if (fileContentUpdated) {
                message = t("integrations.toast.reloaded_latest", { message });
            }
            setSuccess(message);
            showToast(message, "success");
        } catch (reloadErr) {
            const typedReloadErr = reloadErr as ReloadConfigError;
            const reloadMessage =
                typedReloadErr.detail ||
                typedReloadErr.message ||
                t("integrations.error.reload_failed");
            const groupedDiagnostics = mapBackendDiagnostics(
                loadedFilename ?? targetFile ?? "__reload__",
                typedReloadErr.diagnostics,
                reloadMessage,
            );
            setBackendDiagnosticsByFile((prev) => {
                const next = { ...prev };
                Object.entries(groupedDiagnostics).forEach(
                    ([filename, diagnostics]) => {
                        next[filename] = diagnostics;
                    },
                );
                return next;
            });
            setEditorError(reloadMessage);
            setSuccess(t("integrations.status.reload_failed"));
            showToast(
                t("integrations.toast.reload_failed", {
                    message: reloadMessage,
                }),
                "error",
            );
        }

        setTimeout(() => setSuccess(null), 4000);
    }, [
        clearBackendDiagnosticsForFile,
        content,
        loadIntegrations,
        loadIntegrationContent,
        mapBackendDiagnostics,
        selectedFile,
        showToast,
        t,
    ]);

    // Use SWR for data fetching - handles dedup and StrictMode automatically
    const { files, isLoading: filesLoading } = useIntegrationFiles();
    const { presets, isLoading: presetsLoading } = useIntegrationPresets();
    const { metadata } = useIntegrationMetadata();

    // Sync SWR data to state
    useEffect(() => {
        if (!filesLoading && files) {
            setIntegrations(files);
            // Process metadata for display names
            if (metadata) {
                const nextNames: Record<string, string> = {};
                metadata.forEach((item: IntegrationFileMetadata) => {
                    const name = item.name?.trim();
                    if (name) {
                        nextNames[item.filename] = name;
                    }
                });
                setIntegrationDisplayNameByFile(nextNames);
            }
        }
    }, [files, filesLoading, metadata]);

    useEffect(() => {
        if (!presetsLoading && presets) {
            setIntegrationPresets(presets.map(normalizePresetResponse));
        }
    }, [presets, presetsLoading]);

    // Automatically load content if a file is selected (e.g., when returning to the page)
    const hasInitialLoaded = useRef(false);
    useEffect(() => {
        if (
            selectedFile &&
            integrations.length > 0 &&
            !hasInitialLoaded.current
        ) {
            const compatibleFilename = integrations.includes(selectedFile)
                ? selectedFile
                : integrations.includes(`${selectedFile}.yaml`)
                  ? `${selectedFile}.yaml`
                  : null;

            if (compatibleFilename) {
                if (compatibleFilename !== selectedFile) {
                    setSelectedFile(compatibleFilename);
                }
                loadIntegrationContent(compatibleFilename);
                hasInitialLoaded.current = true;
            }
        }
    }, [selectedFile, integrations, loadIntegrationContent]);

    const handleSave = async () => {
        if (!selectedFile) return;

        setSaving(true);
        setEditorError(null);
        setSuccess(null);

        try {
            await api.saveIntegrationFile(selectedFile, content);
            setOriginalContent(content);
            setSuccess(t("integrations.status.saved_file"));

            try {
                const result = await api.reloadConfig();
                clearBackendDiagnosticsForFile(selectedFile);
                await invalidateViews();
                if ((result.auto_refreshed_sources ?? []).length > 0) {
                    await invalidateSources();
                }
                const message = buildReloadToastMessage(
                    t,
                    "save",
                    result,
                    selectedFile,
                );
                setSuccess(message);
                showToast(message, "success");
            } catch (reloadErr) {
                const typedReloadErr = reloadErr as ReloadConfigError;
                const reloadMessage =
                    typedReloadErr.detail ||
                    typedReloadErr.message ||
                    t("integrations.error.reload_failed");
                const groupedDiagnostics = mapBackendDiagnostics(
                    selectedFile,
                    typedReloadErr.diagnostics,
                    reloadMessage,
                );
                setBackendDiagnosticsByFile((prev) => {
                    const next = { ...prev };
                    Object.entries(groupedDiagnostics).forEach(
                        ([filename, diagnostics]) => {
                            next[filename] = diagnostics;
                        },
                    );
                    return next;
                });
                setSuccess(t("integrations.status.saved_reload_failed"));
                setEditorError(reloadMessage);
                showToast(
                    t("integrations.toast.save_reload_failed", {
                        message: reloadMessage,
                    }),
                    "error",
                );
            }

            setTimeout(() => setSuccess(null), 4000);
        } catch (saveErr) {
            const message =
                saveErr instanceof Error
                    ? saveErr.message
                    : t("integrations.error.save_failed");
            setEditorError(message);
            showToast(
                t("integrations.toast.save_failed", { message }),
                "error",
            );
        } finally {
            setSaving(false);
        }
    };

    const handleCreateIntegration = async () => {
        const rawFilename = stripYamlExtension(newFilename);
        if (!rawFilename) return;
        setNewIntegrationError(null);

        const filename = `${rawFilename}.yaml`;
        const displayName = newIntegrationName.trim() || rawFilename;
        const selectedPreset = selectedPresetId
            ? (integrationPresets.find(
                  (preset) => preset.id === selectedPresetId,
              ) ?? null)
            : null;
        const initialContent = selectedPreset
            ? renderPresetContent(selectedPreset.contentTemplate, displayName)
            : `name: ${toYamlSingleQuoted(displayName)}\n`;

        try {
            const created = await api.createIntegrationFile(
                filename,
                initialContent,
            );
            await api.reloadConfig();
            await loadIntegrations();
            setShowNewIntegrationDialog(false);
            setNewFilename("");
            setNewIntegrationName("");
            setSelectedPresetId(null);
            setNewIntegrationError(null);
            // Load the newly created file
            await loadIntegrationContent(created.filename);
        } catch (err: any) {
            setNewIntegrationError(
                err.message || t("integrations.error.create_integration"),
            );
        }
    };

    const handleNewIntegrationDialogChange = (open: boolean) => {
        setShowNewIntegrationDialog(open);
        setNewIntegrationDialogView("create");
        setNewIntegrationError(null);
        if (!open) {
            setNewFilename("");
            setNewIntegrationName("");
            setSelectedPresetId(null);
        }
    };

    const handleCopyIntegrationPrompt = async () => {
        setNewIntegrationError(null);
        try {
            await navigator.clipboard.writeText(INTEGRATION_EDITOR_PROMPT);
            showToast(t("integrations.toast.prompt_copied"), "success");
        } catch (error) {
            console.error("Failed to copy integration prompt:", error);
            setNewIntegrationError(t("integrations.toast.copy_failed"));
        }
    };

    const handleOpenSkillsGithub = async () => {
        setNewIntegrationError(null);
        try {
            await openExternalLink(SKILLS_GITHUB_URL);
        } catch (error) {
            console.error("Failed to open skills GitHub folder:", error);
            setNewIntegrationError(t("integrations.toast.open_github_failed"));
        }
    };

    const handleNewSourceDialogChange = (open: boolean) => {
        setShowNewSourceDialog(open);
        setNewSourceError(null);
        if (!open) {
            setNewSourceName("");
        }
    };

    const handlePresetSelect = (preset: IntegrationPreset) => {
        if (selectedPresetId === preset.id) {
            setSelectedPresetId(null);
        } else {
            setSelectedPresetId(preset.id);
            if (!newFilename.trim()) {
                setNewFilename(preset.filenameHint);
            }
        }
    };

    const handleDeleteIntegration = async (filename: string) => {
        setDeleteIntegrationError(null);
        try {
            await api.deleteIntegrationFile(filename);
            await loadIntegrations();
            clearBackendDiagnosticsForFile(filename);
            setEditorDiagnosticsByFile((prev) => {
                if (!prev[filename]) {
                    return prev;
                }
                const next = { ...prev };
                delete next[filename];
                return next;
            });
            setIntegrationDisplayNameByFile((prev) => {
                if (!prev[filename]) {
                    return prev;
                }
                const next = { ...prev };
                delete next[filename];
                return next;
            });
            if (selectedFile === filename) {
                setSelectedFile(null);
                setContent("");
                setSources([]);
                setSelectedIntegrationIds([]);
                setSelectedFilePath(null);
            }
            setDeletingIntegration(null);
        } catch (err: any) {
            setDeleteIntegrationError(
                err.message || t("integrations.error.delete_integration"),
            );
        }
    };

    const handleCreateSource = async () => {
        if (!newSourceName) return;
        setNewSourceError(null);

        try {
            const integrationId = (selectedIntegrationIds[0] ?? "").trim();

            await api.createSourceFile({
                name: newSourceName,
                integration_id: integrationId || undefined,
            });

            if (selectedFile) {
                const relatedSources =
                    await api.getIntegrationSources(selectedFile);
                setSources(relatedSources);
            }
            setShowNewSourceDialog(false);
            setNewSourceName("");
            setNewSourceError(null);

            // Reload config
            await api.reloadConfig();
        } catch (err: any) {
            setNewSourceError(err.message || t("integrations.error.create_source"));
        }
    };

    const handleDeleteSource = async (sourceId: string) => {
        setDeleteSourceError(null);
        try {
            const deleted = await api.deleteSourceFile(sourceId);
            if (selectedFile) {
                const relatedSources =
                    await api.getIntegrationSources(selectedFile);
                setSources(relatedSources);
            }

            // Reload config
            await api.reloadConfig();
            setDeletingSourceId(null);
            const affectedViewCount = deleted.cleanup?.affected_view_count ?? 0;
            setSuccess(
                t("integrations.status.source_deleted_cleanup", {
                    count: affectedViewCount,
                }),
            );
            setTimeout(() => setSuccess(null), 3000);
        } catch (err: any) {
            setDeleteSourceError(
                err.message || t("integrations.error.delete_source"),
            );
        }
    };

    // Keyboard shortcut for save
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                e.preventDefault();
                if (
                    selectedFile &&
                    content !== originalContent &&
                    !selectedHasBlockingErrors
                ) {
                    handleSave();
                }
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [selectedFile, content, originalContent, selectedHasBlockingErrors]);

    const handleMonacoMount = useCallback(
        async (
            _editor: editor.IStandaloneCodeEditor,
            monaco: typeof Monaco,
        ) => {
            const model = _editor.getModel();
            if (model) {
                model.updateOptions({
                    tabSize: 2,
                    insertSpaces: true,
                });
            }

            await setupYamlWorker(monaco, {
                fileMatch: ["*"], // Match all files since this editor only edits YAML
            });

            // Trigger validation after schema is loaded
            if (model) {
                // Force re-validation by clearing and letting the language service re-validate
                monaco.editor.setModelMarkers(model, "yaml", []);
            }
        },
        [],
    );

    const isDuplicateFilename = (() => {
        const rawFilename = stripYamlExtension(newFilename);
        if (!rawFilename) return false;
        const targetFilename = `${rawFilename.toLowerCase()}.yaml`;
        return integrations.some(
            (existing) => existing.toLowerCase() === targetFilename
        );
    })();
    const defaultIntegrationName = stripYamlExtension(newFilename);
    const diagnosticsHeaderKey =
        selectedErrorDiagnostics.length > 0 &&
        selectedWarningDiagnostics.length > 0
            ? "integrations.validation_issues"
            : selectedErrorDiagnostics.length > 0
              ? "integrations.validation_errors"
              : "integrations.validation_warnings";
    const diagnosticsHasErrors = selectedErrorDiagnostics.length > 0;
    const diagnosticsPanelClass = diagnosticsHasErrors
        ? "absolute bottom-0 left-0 right-0 bg-background/95 border-t border-error/30 z-10 transition-all duration-200 ease-out flex flex-col backdrop-blur-sm"
        : "absolute bottom-0 left-0 right-0 bg-background/95 border-t border-warning/40 z-10 transition-all duration-200 ease-out flex flex-col backdrop-blur-sm";
    const diagnosticsHeaderTextClass = diagnosticsHasErrors
        ? "flex items-center gap-2 text-sm font-medium text-error"
        : "flex items-center gap-2 text-sm font-medium text-warning";
    const diagnosticsBodyClass = diagnosticsHasErrors
        ? "flex-1 overflow-y-auto p-4 bg-error/5"
        : "flex-1 overflow-y-auto p-4 bg-warning/5";

    return (
        <TooltipProvider>
            <RouteInterceptor when={content !== originalContent && !!selectedFile} />
            <div className="flex h-full min-w-0 bg-transparent text-foreground">
                {/* Sidebar */}
                <aside
                    className={`border-r border-border bg-surface/30 flex flex-col transition-all duration-300 ${sidebarCollapsed ? "w-14" : "w-64"}`}
                >
                    <div className="p-3 border-b border-border flex items-center justify-center gap-2">
                        {!sidebarCollapsed && (
                            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2 flex-1">
                                <FileJson className="w-4 h-4" />
                                {t("integrations.title")}
                            </h2>
                        )}
                        <div className="flex items-center gap-1">
                            <Dialog
                                open={showNewIntegrationDialog}
                                onOpenChange={
                                    handleNewIntegrationDialogChange
                                }
                            >
                                <DialogContent className="max-w-lg">
                                    {newIntegrationDialogView === "create" ? (
                                        <>
                                            <DialogHeader>
                                            <DialogTitle>
                                                {t("integrations.new_dialog.title")}
                                            </DialogTitle>
                                            <DialogDescription>
                                                {t("integrations.new_dialog.description")}
                                            </DialogDescription>
                                            </DialogHeader>
                                            <div className="py-3 space-y-4">
                                            {/* ID (Filename) Input */}
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <Label
                                                        htmlFor="new-integration-id"
                                                        className="text-sm font-medium"
                                                    >
                                                        {t("integrations.new_dialog.id_label")}
                                                    </Label>
                                                    {isDuplicateFilename && (
                                                        <span className="text-xs text-error font-medium">
                                                            {t("integrations.new_dialog.file_exists")}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className={`flex items-center rounded-md border transition-colors duration-150 ${isDuplicateFilename ? "border-error bg-error/5" : "border-input focus-within:border-brand focus-within:ring-1 focus-within:ring-brand/20"}`}>
                                                    <Input
                                                        id="new-integration-id"
                                                        placeholder={t("integrations.new_dialog.id_placeholder")}
                                                        value={newFilename}
                                                        onChange={(e) => {
                                                            const val =
                                                                e.target.value;
                                                            setNewFilename(
                                                                stripYamlExtension(
                                                                    val,
                                                                ),
                                                            );
                                                        }}
                                                        className="flex-1 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent"
                                                    />
                                                    <span className="flex h-10 items-center justify-center border-l border-border bg-muted/50 px-3 text-sm font-mono text-muted-foreground select-none">
                                                        .yaml
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Name Input */}
                                            <div className="space-y-2">
                                                <Label
                                                    htmlFor="new-integration-name"
                                                    className="text-sm font-medium"
                                                >
                                                    {t("integrations.new_dialog.name_label")}
                                                </Label>
                                                <Input
                                                    id="new-integration-name"
                                                    placeholder={
                                                        defaultIntegrationName ||
                                                        t("integrations.new_dialog.name_placeholder")
                                                    }
                                                    value={newIntegrationName}
                                                    onChange={(e) =>
                                                        setNewIntegrationName(
                                                            e.target.value,
                                                        )
                                                    }
                                                    className="border-input focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand/20"
                                                />
                                            </div>

                                            {/* Presets Section */}
                                            <div className="space-y-2">
                                                <Label className="text-sm font-medium">
                                                    {t("integrations.new_dialog.process_label")}
                                                </Label>
                                                <div className="grid grid-cols-2 gap-2">
                                                    {integrationPresets.map(
                                                        (preset) => {
                                                            const selected =
                                                                selectedPresetId ===
                                                                preset.id;
                                                            const IconComponent = preset.icon;
                                                            return (
                                                                <Tooltip key={preset.id}>
                                                                    <TooltipTrigger asChild>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() =>
                                                                                handlePresetSelect(
                                                                                    preset,
                                                                                )
                                                                            }
                                                                            className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-150 ${selected ? "border-brand bg-brand/10 shadow-soft-elevation" : "border-border bg-surface hover:border-brand/50 hover:bg-surface/80"}`}
                                                                        >
                                                                            <IconComponent className={`w-5 h-5 flex-shrink-0 ${selected ? "text-brand" : "text-muted-foreground"}`} />
                                                                            <p className="text-sm font-medium truncate">
                                                                                {preset.label}
                                                                            </p>
                                                                        </button>
                                                                    </TooltipTrigger>
                                                                    <TooltipContent side="top" className="max-w-xs">
                                                                        {preset.description}
                                                                    </TooltipContent>
                                                                </Tooltip>
                                                            );
                                                        },
                                                    )}
                                                </div>
                                            </div>

                                            <InlineError message={newIntegrationError} />
                                            </div>
                                            <DialogFooter>
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <Button
                                                        variant="outline"
                                                        size="icon"
                                                        aria-label={t("integrations.new_dialog.ai_prompt_aria")}
                                                        onClick={() =>
                                                            setNewIntegrationDialogView(
                                                                "ai-prompt",
                                                            )
                                                        }
                                                        className="h-9 w-9 border-amber-500/50 text-amber-600 dark:text-amber-400 hover:border-amber-500 hover:text-amber-600 hover:bg-amber-500/10"
                                                    >
                                                        <Sparkles className="h-4 w-4" />
                                                    </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                    {t("integrations.tooltip.open_ai_prompt")}
                                                </TooltipContent>
                                            </Tooltip>
                                            <div className="flex-1" />
                                            <Button
                                                variant="outline"
                                                onClick={() =>
                                                    handleNewIntegrationDialogChange(
                                                        false,
                                                    )
                                                }
                                            >
                                                {t("integrations.button.cancel")}
                                            </Button>
                                            <Button
                                                onClick={
                                                    handleCreateIntegration
                                                }
                                                disabled={!newFilename.trim() || isDuplicateFilename}
                                                className="bg-brand-gradient text-white hover:opacity-90 transition-opacity duration-150"
                                            >
                                                {t("integrations.button.create")}
                                            </Button>
                                            </DialogFooter>
                                        </>
                                    ) : (
                                        <>
                                            <DialogHeader>
                                                <DialogTitle>{t("integrations.ai_prompt.title")}</DialogTitle>
                                                <DialogDescription>
                                                    {t("integrations.ai_prompt.description")}
                                                </DialogDescription>
                                            </DialogHeader>
                                            <div className="py-4 space-y-3">
                                                <Button
                                                    variant="outline"
                                                    className="h-auto w-full justify-start gap-3 border-brand/40 bg-brand/5 px-4 py-4 text-left hover:bg-brand/10"
                                                    onClick={handleCopyIntegrationPrompt}
                                                >
                                                    <Copy className="h-4 w-4 text-brand" />
                                                    {t("integrations.ai_prompt.copy")}
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    className="h-auto w-full justify-start gap-3 border-warning/50 bg-warning/10 px-4 py-4 text-left hover:bg-warning/20"
                                                    onClick={handleOpenSkillsGithub}
                                                >
                                                    <ExternalLink className="h-4 w-4 text-warning" />
                                                    {t("integrations.ai_prompt.open_github")}
                                                </Button>
                                                <InlineError message={newIntegrationError} />
                                            </div>
                                            <DialogFooter>
                                                <Button
                                                    variant="outline"
                                                    onClick={() =>
                                                        setNewIntegrationDialogView("create")
                                                    }
                                                >
                                                    {t("integrations.ai_prompt.back")}
                                                </Button>
                                                <Button
                                                    onClick={() =>
                                                        handleNewIntegrationDialogChange(false)
                                                    }
                                                >
                                                    {t("integrations.ai_prompt.close")}
                                                </Button>
                                            </DialogFooter>
                                        </>
                                    )}
                                    </DialogContent>
                                </Dialog>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        onClick={() =>
                                            setSidebarCollapsed(
                                                !sidebarCollapsed,
                                            )
                                        }
                                        className="h-8 w-8 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-foreground hover:text-background transition-colors duration-150 -my-1"
                                    >
                                        {sidebarCollapsed ? (
                                            <ChevronRight className="h-4 w-4" />
                                        ) : (
                                            <ChevronLeft className="h-4 w-4" />
                                        )}
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side="right">
                                    {sidebarCollapsed
                                        ? t("common.expand")
                                        : t("common.collapse")}
                                </TooltipContent>
                            </Tooltip>
                        </div>
                    </div>

                    {!sidebarCollapsed && (
                        <div className="p-3 border-b border-border/40 flex items-center gap-2 bg-surface/50">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleNewIntegrationDialogChange(true)}
                                        className="flex-1 h-8 bg-transparent border-border/50 text-muted-foreground hover:bg-foreground hover:text-background hover:border-foreground transition-all duration-200"
                                    >
                                        <Plus className="h-3.5 w-3.5 mr-1.5" />
                                        {t("integrations.sidebar.new")}
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="text-xs">
                                    {t("integrations.sidebar.tooltip_new")}
                                </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleReloadFile}
                                        className="flex-1 h-8 bg-transparent border-border/50 text-muted-foreground hover:bg-foreground hover:text-background hover:border-foreground transition-all duration-200"
                                    >
                                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                                        {t("integrations.sidebar.reload")}
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="text-xs">
                                    {t("integrations.sidebar.tooltip_reload")}
                                </TooltipContent>
                            </Tooltip>
                        </div>
                    )}

                    {sidebarCollapsed ? (
                        <div className="flex-1 flex flex-col items-center gap-3 p-2 overflow-y-auto">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-muted-foreground hover:bg-foreground hover:text-background transition-colors duration-150 mb-1"
                                        onClick={handleReloadFile}
                                    >
                                        <RefreshCw className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent side="right" className="text-xs">
                                    {t("integrations.sidebar.tooltip_reload")}
                                </TooltipContent>
                            </Tooltip>
                            {integrations.map((file) => {
                                const displayName =
                                    integrationDisplayNameByFile[file]?.trim();
                                const hasDisplayName = Boolean(displayName);
                                const title = displayName || file;
                                return (
                                    <Tooltip key={file}>
                                        <TooltipTrigger asChild>
                                            <button
                                                onClick={() =>
                                                    loadIntegrationContent(file)
                                                }
                                                className={`h-10 w-10 flex items-center justify-center rounded-md transition-colors duration-150 ${selectedFile === file ? "bg-brand/20 text-brand" : "hover:bg-foreground hover:text-background text-muted-foreground"}`}
                                            >
                                                <span className="relative inline-flex">
                                                    <FileJson className="h-5 w-5" />
                                                    {hasFileErrors(file) && (
                                                        <AlertCircle className="absolute -top-1 -right-1 h-3.5 w-3.5 text-error" />
                                                    )}
                                                    {hasFileWarnings(file) && (
                                                        <AlertTriangle className="absolute -top-1 -right-1 h-3.5 w-3.5 text-warning" />
                                                    )}
                                                </span>
                                            </button>
                                        </TooltipTrigger>
                                        <TooltipContent side="right">
                                            <div className="flex max-w-56 flex-col">
                                                <span className="truncate text-sm">
                                                    {title}
                                                </span>
                                                {hasDisplayName && (
                                                    <span className="truncate text-xs text-muted-foreground">
                                                        {file}
                                                    </span>
                                                )}
                                            </div>
                                        </TooltipContent>
                                    </Tooltip>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto p-2">
                            {integrations.map((file) => {
                                const displayName =
                                    integrationDisplayNameByFile[file]?.trim();
                                const hasDisplayName = Boolean(displayName);
                                const title = displayName || file;
                                return (
                                    <div
                                        key={file}
                                        className={`group flex items-center justify-between p-2 rounded-md cursor-pointer mb-1 transition-colors duration-150 ${
                                            selectedFile === file
                                                ? "bg-brand/10 text-brand"
                                                : "hover:bg-foreground hover:text-background"
                                        }`}
                                        onClick={() =>
                                            loadIntegrationContent(file)
                                        }
                                    >
                                        <div className="min-w-0 flex items-center gap-2 overflow-hidden">
                                            <Tooltip>
                                                <TooltipTrigger asChild>
                                                    <div className="min-w-0">
                                                        <p className="text-sm truncate">
                                                            {title}
                                                        </p>
                                                        {hasDisplayName && (
                                                            <p className="text-[11px] leading-tight truncate text-muted-foreground">
                                                                {file}
                                                            </p>
                                                        )}
                                                    </div>
                                                </TooltipTrigger>
                                                <TooltipContent side="top">
                                                    <div className="flex max-w-72 flex-col">
                                                        <span className="truncate text-sm">
                                                            {title}
                                                        </span>
                                                        {hasDisplayName && (
                                                            <span className="truncate text-xs text-muted-foreground">
                                                                {file}
                                                            </span>
                                                        )}
                                                    </div>
                                                </TooltipContent>
                                            </Tooltip>
                                            {hasFileErrors(file) && (
                                                <Badge variant="error">
                                                    {t("dashboard.status.error")}
                                                </Badge>
                                            )}
                                            {hasFileWarnings(file) && (
                                                <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                                            )}
                                        </div>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className={`h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-brand/50 ${selectedFile === file ? "hover:bg-brand/20 text-brand" : ""}`}
                                                    onClick={(e) =>
                                                        e.stopPropagation()
                                                    }
                                                >
                                                    <MoreVertical className="h-3 w-3" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem
                                                    className="text-destructive"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setDeletingIntegration(
                                                            file,
                                                        );
                                                    }}
                                                >
                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                    {t("common.delete")}
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                );
                            })}
                            {integrations.length === 0 && (
                                <p className="text-xs text-muted-foreground p-2">
                                    {t("integrations.empty.no_files")}
                                </p>
                            )}
                        </div>
                    )}
                </aside>

                {/* Main Content */}
                <main className="flex-1 min-w-0 flex flex-col">
                    {selectedFile ? (
                        <>
                            {/* Toolbar */}
                            <div className="h-14 border-b border-border px-4 flex items-center justify-between gap-2 bg-surface/50">
                                <div className="flex min-w-0 flex-1 items-center gap-2">
                                    <h3 className="font-medium truncate">
                                        {selectedFile}
                                    </h3>
                                    {selectedFilePath && (
                                        <span
                                            className="hidden max-w-[38vw] truncate text-xs text-muted-foreground lg:inline"
                                            title={selectedFilePath}
                                        >
                                            {selectedFilePath}
                                        </span>
                                    )}
                                    {content !== originalContent && (
                                        <Badge variant="secondary">
                                            {t("integrations.status.unsaved")}
                                        </Badge>
                                    )}
                                </div>
                                <div className="flex shrink-0 items-center gap-2 min-w-0">
                                    {editorError && (
                                        <span className="hidden max-w-[32vw] truncate text-destructive text-sm sm:flex items-center gap-1">
                                            <AlertCircle className="h-4 w-4" />
                                            {editorError}
                                        </span>
                                    )}
                                    {success && (
                                        <span className="hidden max-w-[24vw] truncate text-green-500 text-sm sm:flex items-center gap-1">
                                            <CheckCircle className="h-4 w-4" />
                                            {success}
                                        </span>
                                    )}
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                size="icon"
                                                className="h-8 w-8 bg-brand-gradient text-white hover:opacity-90 transition-all duration-150 focus-visible:ring-2 focus-visible:ring-brand/50 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                                onClick={handleSave}
                                                disabled={
                                                    saving ||
                                                    content ===
                                                        originalContent ||
                                                    selectedHasBlockingErrors
                                                }
                                            >
                                                <Save className="h-4 w-4" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            {selectedHasBlockingErrors
                                                ? t("integrations.tooltip.save_disabled")
                                                : t("integrations.tooltip.save_enabled")}
                                        </TooltipContent>
                                    </Tooltip>
                                </div>
                            </div>

                            {/* Editor */}
                            <div className="flex-1 min-w-0 overflow-hidden">
                                <Editor
                                    height="100%"
                                    path={editorModelPath}
                                    language="yaml"
                                    defaultLanguage="yaml"
                                    value={content}
                                    onChange={(value) =>
                                        setContent(value || "")
                                    }
                                    onMount={handleMonacoMount}
                                    onValidate={handleEditorValidate}
                                    theme={isDarkTheme ? "vs-dark" : "light"}
                                    options={{
                                        minimap: { enabled: false },
                                        fontSize: 14,
                                        tabSize: 2,
                                        insertSpaces: true,
                                        detectIndentation: false,
                                        wordWrap: "on",
                                        automaticLayout: true,
                                        renderValidationDecorations: "on",
                                    }}
                                />
                            </div>

                            {/* Source Management Section */}
                            <div className="h-64 border-t border-border bg-surface/30 flex flex-col relative overflow-hidden">
                                {selectedDiagnostics.length > 0 && (
                                    <div
                                        className={`${diagnosticsPanelClass} ${diagnosticsExpanded ? "h-full" : "h-10"}`}
                                    >
                                        <div
                                            className="h-10 px-4 flex items-center justify-between cursor-pointer border-b border-border hover:bg-surface/50 transition-colors duration-150"
                                            onClick={() =>
                                                setDiagnosticsExpanded(
                                                    !diagnosticsExpanded,
                                                )
                                            }
                                        >
                                            <div className={diagnosticsHeaderTextClass}>
                                                {diagnosticsHasErrors ? (
                                                    <AlertCircle className="h-4 w-4" />
                                                ) : (
                                                    <AlertTriangle className="h-4 w-4" />
                                                )}
                                                {t(diagnosticsHeaderKey, {
                                                    count: selectedDiagnostics.length,
                                                })}
                                            </div>
                                            <ChevronRight
                                                className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${diagnosticsExpanded ? "rotate-90" : "-rotate-90"}`}
                                            />
                                        </div>
                                        {diagnosticsExpanded && (
                                            <div className={diagnosticsBodyClass}>
                                                {selectedDiagnostics.map(
                                                    (diagnostic, index) => (
                                                        <DiagnosticItem
                                                            key={`${diagnostic.code || "diag"}-${index}`}
                                                            diagnostic={
                                                                diagnostic
                                                            }
                                                        />
                                                    ),
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}
                                <div className="p-3 border-b border-border flex items-center justify-between">
                                    <h3 className="text-sm font-semibold flex items-center gap-2">
                                        <Database className="w-4 h-4" />
                                        {t("integrations.sources.section_title", {
                                            count: sources.length,
                                        })}
                                    </h3>
                                    <Dialog
                                        open={showNewSourceDialog}
                                        onOpenChange={
                                            handleNewSourceDialogChange
                                        }
                                    >
                                        <DialogTrigger asChild>
                                            <Button variant="outline" size="sm">
                                                <Plus className="h-4 w-4 mr-1" />
                                                {t("integrations.sources.create_button")}
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent>
                                            <DialogHeader>
                                                <DialogTitle>
                                                    {t("integrations.sources.dialog.title")}
                                                </DialogTitle>
                                                <DialogDescription>
                                                    {t("integrations.sources.dialog.description")}
                                                </DialogDescription>
                                            </DialogHeader>
                                            <div className="py-4 space-y-4">
                                                <div>
                                                    <label className="text-sm font-medium">
                                                        {t("integrations.sources.dialog.name_label")}
                                                    </label>
                                                    <Input
                                                        placeholder={t("integrations.sources.dialog.name_placeholder")}
                                                        value={newSourceName}
                                                        onChange={(e) =>
                                                            setNewSourceName(
                                                                e.target.value,
                                                            )
                                                        }
                                                        className="mt-1"
                                                    />
                                                    <p className="text-xs text-muted-foreground mt-1">
                                                        {t("integrations.sources.dialog.name_hint")}
                                                    </p>
                                                </div>
                                                <InlineError message={newSourceError} />
                                            </div>
                                            <DialogFooter>
                                                <Button
                                                    variant="outline"
                                                    onClick={() =>
                                                        handleNewSourceDialogChange(
                                                            false,
                                                        )
                                                    }
                                                >
                                                    {t("integrations.button.cancel")}
                                                </Button>
                                                <Button
                                                    onClick={handleCreateSource}
                                                >
                                                    {t("integrations.sources.create_button")}
                                                </Button>
                                            </DialogFooter>
                                        </DialogContent>
                                    </Dialog>
                                </div>
                                <div className="flex-1 overflow-y-auto p-3">
                                    {sources.length > 0 ? (
                                        <div className="grid gap-2">
                                            {sources.map((source) => (
                                                <Card
                                                    key={source.id}
                                                    className="w-full bg-surface border-border hover:border-foreground/20 hover:shadow-soft-elevation transition-all duration-150"
                                                >
                                                    <CardContent className="p-3 flex items-center justify-between">
                                                        <div className="min-w-0">
                                                            <span className="font-medium block truncate">
                                                                {source.name}
                                                            </span>
                                                            <span className="text-xs text-muted-foreground ml-0 md:ml-2 inline-block">
                                                                {t("integrations.sources.id", {
                                                                    id: source.id,
                                                                })}
                                                            </span>
                                                            {source.integration_id && (
                                                                <span className="text-xs text-muted-foreground ml-0 md:ml-2 inline-block">
                                                                    {t("integrations.sources.via", {
                                                                        integration: source.integration_id,
                                                                    })}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            aria-label={t("integrations.sources.delete_aria", {
                                                                id: source.id,
                                                            })}
                                                            className="h-8 w-8 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand/50"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setDeletingSourceId(source.id);
                                                                setDeleteSourceError(null);
                                                            }}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </CardContent>
                                                </Card>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-muted-foreground text-center py-4">
                                            {t("integrations.sources.empty")}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center">
                            <EmptyState
                                icon={<FileJson className="h-8 w-8" />}
                                title={t("integrations.empty.title")}
                                description={t("integrations.empty.description")}
                                actionLabel={t("integrations.empty.action")}
                                onAction={() => handleNewIntegrationDialogChange(true)}
                            />
                        </div>
                    )}
                </main>
            </div>

            <Dialog
                open={deletingIntegration !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setDeletingIntegration(null);
                        setDeleteIntegrationError(null);
                    }
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("integrations.delete_integration.title")}</DialogTitle>
                        <DialogDescription>
                            {t("integrations.delete_integration.description", {
                                name: deletingIntegration ?? "",
                            })}
                        </DialogDescription>
                    </DialogHeader>
                    <InlineError message={deleteIntegrationError} className="mt-2" />
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setDeletingIntegration(null);
                                setDeleteIntegrationError(null);
                            }}
                        >
                            {t("integrations.button.cancel")}
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() =>
                                deletingIntegration &&
                                handleDeleteIntegration(deletingIntegration)
                            }
                        >
                            {t("common.confirmDelete")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={deletingSourceId !== null}
                onOpenChange={(open) => {
                    if (!open) {
                        setDeletingSourceId(null);
                        setDeleteSourceError(null);
                    }
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("integrations.delete_source.title")}</DialogTitle>
                        <DialogDescription>
                            {t("integrations.delete_source.description", {
                                id: deletingSourceId ?? "",
                            })}
                        </DialogDescription>
                    </DialogHeader>
                    <InlineError message={deleteSourceError} className="mt-2" />
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setDeletingSourceId(null);
                                setDeleteSourceError(null);
                            }}
                        >
                            {t("integrations.button.cancel")}
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() =>
                                deletingSourceId &&
                                handleDeleteSource(deletingSourceId)
                            }
                        >
                            {t("common.confirmDelete")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </TooltipProvider>
    );
}
