import { useEffect, useState, useCallback, useRef } from "react";
import Editor from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import type * as Monaco from "monaco-editor";
import { api } from "../api/client";
import type { ReloadConfigDiagnostic } from "../api/client";
import { useStore } from "../store";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
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
    RotateCcw,
    ChevronLeft,
    ChevronRight,
} from "lucide-react";
import { Badge } from "../components/ui/badge";
import { useTheme } from "../components/theme-provider";
import {
    markersToDiagnostics,
    setupYamlWorker,
    type IntegrationDiagnostic,
} from "../components/editor/YamlEditorWorkerSetup";

type ReloadConfigError = Error & {
    diagnostics?: ReloadConfigDiagnostic[];
    detail?: string;
};

function normalizeIntegrationFilename(input: string): string {
    return input.trim();
}

function toYamlSingleQuoted(value: string): string {
    return `'${value.replace(/'/g, "''")}'`;
}

function DiagnosticItem({ diagnostic }: { diagnostic: IntegrationDiagnostic }) {
    const [expanded, setExpanded] = useState(false);
    const locationPrefix = diagnostic.line && diagnostic.column
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
                       {locationPrefix && <span className="text-muted-foreground">{locationPrefix}</span>}
                       {diagnostic.message}
                   </span>
                </div>
                <ChevronRight className={`h-4 w-4 flex-shrink-0 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`} />
            </div>
            {expanded && (
                <div className="mt-2 text-muted-foreground pl-5 border-l-2 border-error/20 ml-1.5 space-y-1">
                    <p>
                    {diagnostic.line && diagnostic.column
                        ? `Location: line ${diagnostic.line}, column ${diagnostic.column}`
                        : "No precise position from backend"}
                    </p>
                    {diagnostic.fieldPath && <p>Field: {diagnostic.fieldPath}</p>}
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

    const [integrations, setIntegrations] = useState<string[]>([]);
    const [content, setContent] = useState<string>("");
    const [originalContent, setOriginalContent] = useState<string>("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
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
    const [newFilename, setNewFilename] = useState("");
    const [newIntegrationName, setNewIntegrationName] = useState("");
    const [newSourceName, setNewSourceName] = useState("");
    const [integrationDisplayNameByFile, setIntegrationDisplayNameByFile] =
        useState<Record<string, string>>({});

    const [deletingIntegration, setDeletingIntegration] = useState<
        string | null
    >(null);
    const [deletingSourceId, setDeletingSourceId] = useState<string | null>(
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

    const selectedDiagnostics =
        selectedFile ? getFileDiagnostics(selectedFile) : [];

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

    const loadIntegrationContent = async (filename: string) => {
        try {
            const data = await api.getIntegrationFile(filename);
            setSelectedFile(data.filename);
            setContent(data.content);
            setOriginalContent(data.content);
            setSelectedIntegrationIds(data.integration_ids ?? []);
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
            setError(null);

            // Load related sources
            const relatedSources = await api.getIntegrationSources(data.filename);
            setSources(relatedSources);
        } catch (err) {
            setError(`Failed to load ${filename}`);
            console.error(err);
        }
    };

    useEffect(() => {
        const init = async () => {
            await loadIntegrations();
        };
        init();
    }, [loadIntegrations]);

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
        setError(null);
        setSuccess(null);

        try {
            await api.saveIntegrationFile(selectedFile, content);
            setOriginalContent(content);
            setSuccess("Saved file.");

            try {
                const result = await api.reloadConfig();
                clearBackendDiagnosticsForFile(selectedFile);
                if (result.affected_sources.length > 0) {
                    setSuccess(
                        `Saved! Reloaded config. Affected sources: ${result.affected_sources.join(", ")}`,
                    );
                } else {
                    setSuccess("Saved and reloaded config.");
                }
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
                setSuccess("Saved file, but config reload failed.");
                setError(reloadMessage);
            }

            setTimeout(() => setSuccess(null), 4000);
        } catch (saveErr) {
            const message =
                saveErr instanceof Error ? saveErr.message : "Failed to save";
            setError(message);
        } finally {
            setSaving(false);
        }
    };

    const handleCreateIntegration = async () => {
        const rawFilename = newFilename.trim();
        if (!rawFilename) return;

        // Ensure the filename has .yaml extension
        const filename = rawFilename.toLowerCase().endsWith(".yaml")
            ? rawFilename
            : `${rawFilename}.yaml`;
        const displayName = newIntegrationName.trim();
        const initialContent = displayName
            ? `name: ${toYamlSingleQuoted(displayName)}\n`
            : "";

        try {
            const created = await api.createIntegrationFile(
                filename,
                initialContent,
            );
            await loadIntegrations();
            setShowNewIntegrationDialog(false);
            setNewFilename("");
            setNewIntegrationName("");
            // Load the newly created file
            await loadIntegrationContent(created.filename);
        } catch (err: any) {
            setError(err.message || "Failed to create integration");
        }
    };

    const handleNewIntegrationDialogChange = (open: boolean) => {
        setShowNewIntegrationDialog(open);
        if (!open) {
            setNewFilename("");
            setNewIntegrationName("");
        }
    };

    const handleDeleteIntegration = async (filename: string) => {
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
            }
            setDeletingIntegration(null);
        } catch (err: any) {
            setError(err.message || "Failed to delete integration");
        }
    };

    const handleCreateSource = async () => {
        if (!newSourceName) return;

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

            // Reload config
            await api.reloadConfig();
        } catch (err: any) {
            setError(err.message || "Failed to create source");
        }
    };

    const handleDeleteSource = async (sourceId: string) => {
        try {
            await api.deleteSourceFile(sourceId);
            if (selectedFile) {
                const relatedSources =
                    await api.getIntegrationSources(selectedFile);
                setSources(relatedSources);
            }

            // Reload config
            await api.reloadConfig();
            setDeletingSourceId(null);
        } catch (err: any) {
            setError(err.message || "Failed to delete source");
        }
    };

    // Keyboard shortcut for save
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                e.preventDefault();
                if (selectedFile && content !== originalContent && selectedDiagnostics.length === 0) {
                    handleSave();
                }
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [selectedFile, content, originalContent, selectedDiagnostics]);

    const handleMonacoMount = useCallback(
        async (_editor: editor.IStandaloneCodeEditor, monaco: typeof Monaco) => {
            const model = _editor.getModel();

            await setupYamlWorker(monaco, {
                fileMatch: ["*"], // Match all files since this editor only edits YAML
            });

            // Trigger validation after schema is loaded
            if (model) {
                // Force re-validation by clearing and letting the language service re-validate
                monaco.editor.setModelMarkers(model, 'yaml', []);
            }
        },
        [],
    );

    return (
        <TooltipProvider>
            <div className="flex h-full bg-transparent text-foreground">
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
                            {!sidebarCollapsed && (
                                <Dialog
                                    open={showNewIntegrationDialog}
                                    onOpenChange={
                                        handleNewIntegrationDialogChange
                                    }
                                >
                                    <DialogTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 text-muted-foreground hover:bg-foreground hover:text-background transition-colors duration-150"
                                        >
                                            <Plus className="h-4 w-4" />
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent>
                                        <DialogHeader>
                                            <DialogTitle>
                                                New Integration
                                            </DialogTitle>
                                            <DialogDescription>
                                                Create a new integration YAML
                                                file.
                                            </DialogDescription>
                                        </DialogHeader>
                                        <div className="py-4 space-y-4">
                                            <div className="space-y-1.5">
                                                <Label htmlFor="new-integration-id">
                                                    Integration ID (filename)
                                                </Label>
                                                <div className="flex items-center rounded-md border border-input focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 ring-offset-background">
                                                    <Input
                                                        id="new-integration-id"
                                                        placeholder="github_oauth"
                                                        value={newFilename}
                                                        onChange={(e) => {
                                                            const val =
                                                                e.target.value;
                                                            setNewFilename(
                                                                val
                                                                    .toLowerCase()
                                                                    .endsWith(
                                                                        ".yaml",
                                                                    )
                                                                    ? val.slice(
                                                                          0,
                                                                          -5,
                                                                      )
                                                                    : val,
                                                            );
                                                        }}
                                                        className="flex-1 border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                                                    />
                                                    <span className="flex h-10 items-center justify-center rounded-r-md border-l border-input bg-muted px-3 text-sm font-medium text-muted-foreground select-none">
                                                        .yaml
                                                    </span>
                                                </div>
                                                <p className="text-xs text-muted-foreground">
                                                    File name stem is used as
                                                    integration id.
                                                </p>
                                            </div>
                                            <div className="space-y-1.5">
                                                <Label htmlFor="new-integration-name">
                                                    Display Name (optional)
                                                </Label>
                                                <Input
                                                    id="new-integration-name"
                                                    placeholder="GitHub 登录"
                                                    value={newIntegrationName}
                                                    onChange={(e) =>
                                                        setNewIntegrationName(
                                                            e.target.value,
                                                        )
                                                    }
                                                />
                                                <p className="text-xs text-muted-foreground">
                                                    When provided, name is
                                                    written into the new YAML
                                                    and shown in sidebar.
                                                </p>
                                            </div>
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
                                            >
                                                Create
                                            </Button>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>
                            )}
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        onClick={() =>
                                            setSidebarCollapsed(
                                                !sidebarCollapsed,
                                            )
                                        }
                                        className="h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:bg-foreground hover:text-background transition-colors duration-150"
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

                    {sidebarCollapsed ? (
                        <div className="flex-1 flex flex-col items-center gap-3 p-2 overflow-y-auto">
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-muted-foreground hover:bg-foreground hover:text-background transition-colors duration-150"
                                        onClick={() =>
                                            setShowNewIntegrationDialog(true)
                                        }
                                    >
                                        <Plus className="h-4 w-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent side="right">
                                    New Integration
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
                                                    className={`h-6 w-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-brand/50 ${selectedFile === file ? "hover:bg-brand/20 text-brand" : ""}`}
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
                <main className="flex-1 flex flex-col">
                    {selectedFile ? (
                        <>
                            {/* Toolbar */}
                            <div className="h-14 border-b border-border px-4 flex items-center justify-between bg-surface/50">
                                <div className="flex items-center gap-2">
                                    <h3 className="font-medium">
                                        {selectedFile}
                                    </h3>
                                    {content !== originalContent && (
                                        <Badge variant="secondary">
                                            Unsaved
                                        </Badge>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    {error && (
                                        <span className="text-destructive text-sm flex items-center gap-1">
                                            <AlertCircle className="h-4 w-4" />
                                            {error}
                                        </span>
                                    )}
                                    {success && (
                                        <span className="text-green-500 text-sm flex items-center gap-1">
                                            <CheckCircle className="h-4 w-4" />
                                            {success}
                                        </span>
                                    )}
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                variant="outline"
                                                size="icon"
                                                className="h-8 w-8 hover:bg-foreground hover:text-background transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand/50"
                                                onClick={() =>
                                                    loadIntegrationContent(
                                                        selectedFile,
                                                    )
                                                }
                                            >
                                                <RotateCcw className="h-4 w-4" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            Reload file from disk
                                        </TooltipContent>
                                    </Tooltip>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Button
                                                size="icon"
                                                className="h-8 w-8 bg-brand-gradient text-white hover:opacity-90 transition-all duration-150 focus-visible:ring-2 focus-visible:ring-brand/50 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                                onClick={handleSave}
                                                disabled={
                                                    saving ||
                                                    content === originalContent ||
                                                    selectedDiagnostics.length > 0
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
                            <div className="flex-1 overflow-hidden">
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
                                        className={`absolute bottom-0 left-0 right-0 bg-background/95 border-t border-error/30 z-10 transition-all duration-200 ease-out flex flex-col backdrop-blur-sm ${diagnosticsExpanded ? 'h-full' : 'h-10'}`}
                                    >
                                        <div
                                            className="h-10 px-4 flex items-center justify-between cursor-pointer border-b border-border hover:bg-surface/50 transition-colors duration-150"
                                            onClick={() => setDiagnosticsExpanded(!diagnosticsExpanded)}
                                        >
                                            <div className="flex items-center gap-2 text-sm font-medium text-error">
                                                <AlertCircle className="h-4 w-4" />
                                                配置错误 ({selectedDiagnostics.length})
                                            </div>
                                            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${diagnosticsExpanded ? "rotate-90" : "-rotate-90"}`} />
                                        </div>
                                        {diagnosticsExpanded && (
                                            <div className="flex-1 overflow-y-auto p-4 bg-error/5">
                                                {selectedDiagnostics.map((diagnostic, index) => (
                                                    <DiagnosticItem key={`${diagnostic.code || "diag"}-${index}`} diagnostic={diagnostic} />
                                                ))}
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
                                        onOpenChange={setShowNewSourceDialog}
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
                                            </div>
                                            <DialogFooter>
                                                <Button
                                                    variant="outline"
                                                    onClick={() =>
                                                        setShowNewSourceDialog(
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
                                                            className="h-8 w-8 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand/50"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setDeletingSourceId(
                                                                    source.id,
                                                                );
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
                            <Card className="w-96 bg-surface border-border">
                                <CardHeader>
                                    <CardTitle>Select an Integration</CardTitle>
                                    <CardDescription>
                                        Choose an integration from the sidebar
                                        or create a new one.
                                    </CardDescription>
                                </CardHeader>
                            </Card>
                        </div>
                    )}
                </main>
            </div>

            <Dialog
                open={deletingIntegration !== null}
                onOpenChange={(open) => !open && setDeletingIntegration(null)}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Confirm Delete</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete{" "}
                            {deletingIntegration}?
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setDeletingIntegration(null)}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() =>
                                deletingIntegration &&
                                handleDeleteIntegration(deletingIntegration)
                            }
                        >
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog
                open={deletingSourceId !== null}
                onOpenChange={(open) => !open && setDeletingSourceId(null)}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Confirm Delete</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete source "
                            {deletingSourceId}"?
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setDeletingSourceId(null)}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={() =>
                                deletingSourceId &&
                                handleDeleteSource(deletingSourceId)
                            }
                        >
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </TooltipProvider>
    );
}
