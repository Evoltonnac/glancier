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
    FileJson,
    Database,
    AlertCircle,
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
import {
    markersToDiagnostics,
    setupYamlWorker,
    type IntegrationDiagnostic,
} from "../components/editor/YamlEditorWorkerSetup";
import { RouteInterceptor } from "../components/RouteInterceptor";
import { EmptyState } from "../components/EmptyState";
import { InlineError } from "../components/InlineError";

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
            ? "保存成功，配置已重载。"
            : "配置已重载，未检测到配置变更。";
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
    const prefix = action === "save" ? "保存成功：" : "重载成功：";

    if (logicChanges.length > 0) {
        const logicFiles = logicChanges.map((item) => item.filename).join(", ");
        const refreshText =
            autoRefreshedSources.length > 0
                ? `已自动刷新 ${autoRefreshedSources.length} 个 source`
                : "未检测到可自动刷新的 source";
        if (viewChanges.length > 0) {
            return `${prefix}检测到逻辑改动（${logicFiles}），${refreshText}；另有 ${viewChanges.length} 个文件仅视图改动。`;
        }
        return `${prefix}检测到逻辑改动（${logicFiles}），${refreshText}。`;
    }

    const viewFiles = viewChanges.map((item) => item.filename).join(", ");
    return `${prefix}仅视图改动（${viewFiles}），未触发 source 自动刷新。`;
}

function DiagnosticItem({ diagnostic }: { diagnostic: IntegrationDiagnostic }) {
    const [expanded, setExpanded] = useState(false);
    const locationPrefix =
        diagnostic.line && diagnostic.column
            ? `l:${diagnostic.line},c:${diagnostic.column} `
            : "";
    return (
        <div className="rounded-md border border-error/20 bg-background/80 px-3 py-2 text-xs mb-2">
            <div
                className="font-medium text-foreground cursor-pointer flex justify-between items-center"
                onClick={() => setExpanded(!expanded)}
            >
                <div className="flex items-center gap-2 truncate pr-2">
                    <AlertCircle className="h-3.5 w-3.5 text-error flex-shrink-0" />
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
                <div className="mt-2 text-muted-foreground pl-5 border-l-2 border-error/20 ml-1.5 space-y-1">
                    <p>
                        {diagnostic.line && diagnostic.column
                            ? `Location: line ${diagnostic.line}, column ${diagnostic.column}`
                            : "No precise position from backend"}
                    </p>
                    {diagnostic.fieldPath && (
                        <p>Field: {diagnostic.fieldPath}</p>
                    )}
                    {diagnostic.code && <p>Code: {diagnostic.code}</p>}
                    <p>Source: {diagnostic.source}</p>
                </div>
            )}
        </div>
    );
}

export default function IntegrationsPage() {
    useTheme(); // Ensure context is used if needed, or simply remove
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

    const selectedDiagnostics = selectedFile
        ? getFileDiagnostics(selectedFile)
        : [];

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
        (filename: string) => getFileDiagnostics(filename).length > 0,
        [getFileDiagnostics],
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
            setEditorError(`Failed to load ${filename}`);
            console.error(err);
            return null;
        }
    }, []);

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
                showToast(`重载文件失败：${targetFile}`, "error");
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
                "reload",
                reloadResult,
                resolvedFocusFile,
            );
            if (fileContentUpdated) {
                message = `已重载最新文件。${message}`;
            }
            setSuccess(message);
            showToast(message, "success");
        } catch (reloadErr) {
            const typedReloadErr = reloadErr as ReloadConfigError;
            const reloadMessage =
                typedReloadErr.detail ||
                typedReloadErr.message ||
                "Configuration reload failed";
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
            setSuccess("重载失败。");
            showToast(`重载失败：${reloadMessage}`, "error");
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
            setSuccess("Saved file.");

            try {
                const result = await api.reloadConfig();
                clearBackendDiagnosticsForFile(selectedFile);
                await invalidateViews();
                if ((result.auto_refreshed_sources ?? []).length > 0) {
                    await invalidateSources();
                }
                const message = buildReloadToastMessage(
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
                    "Configuration reload failed";
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
                setSuccess("保存成功，但配置重载失败。");
                setEditorError(reloadMessage);
                showToast(`保存成功，但重载失败：${reloadMessage}`, "error");
            }

            setTimeout(() => setSuccess(null), 4000);
        } catch (saveErr) {
            const message =
                saveErr instanceof Error ? saveErr.message : "Failed to save";
            setEditorError(message);
            showToast(`保存失败：${message}`, "error");
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
                err.message || "Failed to create integration",
            );
        }
    };

    const handleNewIntegrationDialogChange = (open: boolean) => {
        setShowNewIntegrationDialog(open);
        setNewIntegrationError(null);
        if (!open) {
            setNewFilename("");
            setNewIntegrationName("");
            setSelectedPresetId(null);
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
                err.message || "Failed to delete integration",
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
            setNewSourceError(err.message || "Failed to create source");
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
                `Source deleted. Cleared data/secrets and removed ${affectedViewCount} linked view item(s).`,
            );
            setTimeout(() => setSuccess(null), 3000);
        } catch (err: any) {
            setDeleteSourceError(err.message || "Failed to delete source");
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
                    selectedDiagnostics.length === 0
                ) {
                    handleSave();
                }
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [selectedFile, content, originalContent, selectedDiagnostics]);

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
                                Integrations
                            </h2>
                        )}
                        <div className="flex items-center gap-1">
                            <Dialog
                                open={showNewIntegrationDialog}
                                onOpenChange={
                                    handleNewIntegrationDialogChange
                                }
                            >
                                <DialogContent className="max-w-2xl">
                                        <DialogHeader>
                                            <DialogTitle>
                                                New Integration
                                            </DialogTitle>
                                        </DialogHeader>
                                        <div className="py-4 space-y-5">
                                            {/* ID (Filename) Input */}
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <Label
                                                        htmlFor="new-integration-id"
                                                        className="text-sm font-medium"
                                                    >
                                                        ID (file name)
                                                    </Label>
                                                    {isDuplicateFilename && (
                                                        <span className="text-xs text-error font-medium">
                                                            File already exists
                                                        </span>
                                                    )}
                                                </div>
                                                <div className={`flex items-center rounded-md border transition-colors duration-150 ${isDuplicateFilename ? "border-error bg-error/5" : "border-input focus-within:border-brand focus-within:ring-1 focus-within:ring-brand/20"}`}>
                                                    <Input
                                                        id="new-integration-id"
                                                        placeholder="github_oauth"
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
                                                    Name
                                                </Label>
                                                <Input
                                                    id="new-integration-name"
                                                    placeholder={
                                                        defaultIntegrationName ||
                                                        "integration_name"
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
                                            <div className="space-y-3">
                                                <Label className="text-sm font-medium">
                                                    Presets
                                                </Label>
                                                <div className="relative">
                                                    <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
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
                                                                                className={`flex-shrink-0 w-32 snap-start rounded-lg border transition-all duration-150 ${selected ? "border-brand bg-brand/10 shadow-soft-elevation" : "border-border bg-surface hover:border-brand/50 hover:bg-surface/80"}`}
                                                                            >
                                                                                <div className="flex flex-col items-center justify-center p-4 gap-2">
                                                                                    <div className="w-12 h-12 flex items-center justify-center">
                                                                                        <IconComponent className={`w-10 h-10 ${selected ? "text-brand" : "text-muted-foreground"}`} />
                                                                                    </div>
                                                                                    <p className="text-sm font-medium text-center">
                                                                                        {preset.label}
                                                                                    </p>
                                                                                </div>
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
                                            </div>

                                            <InlineError message={newIntegrationError} />
                                        </div>
                                        <DialogFooter>
                                            <Button
                                                variant="outline"
                                                onClick={() =>
                                                    handleNewIntegrationDialogChange(
                                                        false,
                                                    )
                                                }
                                            >
                                                Cancel
                                            </Button>
                                            <Button
                                                onClick={
                                                    handleCreateIntegration
                                                }
                                                disabled={!newFilename.trim() || isDuplicateFilename}
                                                className="bg-brand-gradient text-white hover:opacity-90 transition-opacity duration-150"
                                            >
                                                Create
                                            </Button>
                                        </DialogFooter>
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
                                    {sidebarCollapsed ? "展开" : "收起"}
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
                                        新建
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="text-xs">新建集成</TooltipContent>
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
                                        重载
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="text-xs">
                                    重新加载配置
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
                                    重新加载配置
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
                                                    Error
                                                </Badge>
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
                                                    Delete
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                );
                            })}
                            {integrations.length === 0 && (
                                <p className="text-xs text-muted-foreground p-2">
                                    No integrations found
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
                                            Unsaved
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
                                                    selectedDiagnostics.length >
                                                        0
                                                }
                                            >
                                                <Save className="h-4 w-4" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            {selectedDiagnostics.length > 0
                                                ? "Fix errors before saving"
                                                : "Save (Ctrl+S)"}
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
                                        className={`absolute bottom-0 left-0 right-0 bg-background/95 border-t border-error/30 z-10 transition-all duration-200 ease-out flex flex-col backdrop-blur-sm ${diagnosticsExpanded ? "h-full" : "h-10"}`}
                                    >
                                        <div
                                            className="h-10 px-4 flex items-center justify-between cursor-pointer border-b border-border hover:bg-surface/50 transition-colors duration-150"
                                            onClick={() =>
                                                setDiagnosticsExpanded(
                                                    !diagnosticsExpanded,
                                                )
                                            }
                                        >
                                            <div className="flex items-center gap-2 text-sm font-medium text-error">
                                                <AlertCircle className="h-4 w-4" />
                                                配置错误 (
                                                {selectedDiagnostics.length})
                                            </div>
                                            <ChevronRight
                                                className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${diagnosticsExpanded ? "rotate-90" : "-rotate-90"}`}
                                            />
                                        </div>
                                        {diagnosticsExpanded && (
                                            <div className="flex-1 overflow-y-auto p-4 bg-error/5">
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
                                        Sources using this integration (
                                        {sources.length})
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
                                                Create Source
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent>
                                            <DialogHeader>
                                                <DialogTitle>
                                                    Create Source
                                                </DialogTitle>
                                                <DialogDescription>
                                                    Create a new data source
                                                    based on this integration.
                                                </DialogDescription>
                                            </DialogHeader>
                                            <div className="py-4 space-y-4">
                                                <div>
                                                    <label className="text-sm font-medium">
                                                        Source Name
                                                    </label>
                                                    <Input
                                                        placeholder="My Source Name"
                                                        value={newSourceName}
                                                        onChange={(e) =>
                                                            setNewSourceName(
                                                                e.target.value,
                                                            )
                                                        }
                                                        className="mt-1"
                                                    />
                                                    <p className="text-xs text-muted-foreground mt-1">
                                                        ID will be
                                                        auto-generated as a
                                                        unique hash.
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
                                                    Cancel
                                                </Button>
                                                <Button
                                                    onClick={handleCreateSource}
                                                >
                                                    Create
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
                                                                (ID: {source.id}
                                                                )
                                                            </span>
                                                            {source.integration_id && (
                                                                <span className="text-xs text-muted-foreground ml-0 md:ml-2 inline-block">
                                                                    via{" "}
                                                                    {
                                                                        source.integration_id
                                                                    }
                                                                </span>
                                                            )}
                                                        </div>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            aria-label={`Delete source ${source.id}`}
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
                                            No sources use this integration yet.
                                        </p>
                                    )}
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex items-center justify-center">
                            <EmptyState
                                icon={<FileJson className="h-8 w-8" />}
                                title="Select an Integration"
                                description="Choose an integration from the sidebar or create a new one to get started."
                                actionLabel="Create Integration"
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
                        <DialogTitle>确认删除集成文件</DialogTitle>
                        <DialogDescription>
                            删除 "{deletingIntegration}" 后，该文件内配置将不可恢复。使用该集成的数据源不会自动删除，但可能因配置缺失而失效。
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
                            取消
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() =>
                                deletingIntegration &&
                                handleDeleteIntegration(deletingIntegration)
                            }
                        >
                            确认删除
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
                        <DialogTitle>确认删除数据源</DialogTitle>
                        <DialogDescription>
                            {`删除 "${deletingSourceId}" 后将同时清理该 source_id 下的数据、密钥，以及绑定到该 source_id 的视图组件。此操作不可撤销。`}
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
                            取消
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() =>
                                deletingSourceId &&
                                handleDeleteSource(deletingSourceId)
                            }
                        >
                            确认删除
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </TooltipProvider>
    );
}
