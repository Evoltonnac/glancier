import { useEffect, useState, useCallback, useRef } from "react";
import Editor from "@monaco-editor/react";
import { api } from "../api/client";
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

    // Source management
    const [sources, setSources] = useState<any[]>([]);

    // Dialogs
    const [showNewIntegrationDialog, setShowNewIntegrationDialog] =
        useState(false);
    const [showNewSourceDialog, setShowNewSourceDialog] = useState(false);
    const [newFilename, setNewFilename] = useState("");
    const [newSourceName, setNewSourceName] = useState("");
    const [newSourceIntegration, setNewSourceIntegration] = useState("");

    const [deletingIntegration, setDeletingIntegration] = useState<
        string | null
    >(null);
    const [deletingSourceId, setDeletingSourceId] = useState<string | null>(
        null,
    );

    const loadIntegrations = useCallback(async () => {
        try {
            const files = await api.listIntegrationFiles();
            setIntegrations(files);
        } catch (err) {
            console.error("Failed to load integrations:", err);
        }
    }, []);

    const loadIntegrationContent = async (filename: string) => {
        try {
            const data = await api.getIntegrationFile(filename);
            setSelectedFile(filename);
            setContent(data.content);
            setOriginalContent(data.content);
            setError(null);

            // Load related sources
            const relatedSources = await api.getIntegrationSources(filename);
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
            if (integrations.includes(selectedFile)) {
                loadIntegrationContent(selectedFile);
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
            setSuccess("Saved successfully!");

            // Trigger config reload
            const result = await api.reloadConfig();
            if (result.affected_sources.length > 0) {
                setSuccess(
                    `Saved! Reloaded config. Affected sources: ${result.affected_sources.join(", ")}`,
                );
            }

            setTimeout(() => setSuccess(null), 3000);
        } catch (err: any) {
            setError(err.message || "Failed to save");
        } finally {
            setSaving(false);
        }
    };

    const handleCreateIntegration = async () => {
        if (!newFilename) return;

        try {
            await api.createIntegrationFile(
                newFilename.endsWith(".yaml")
                    ? newFilename
                    : `${newFilename}.yaml`,
            );
            await loadIntegrations();
            setShowNewIntegrationDialog(false);
            setNewFilename("");
            // Load the newly created file
            await loadIntegrationContent(
                newFilename.endsWith(".yaml")
                    ? newFilename
                    : `${newFilename}.yaml`,
            );
        } catch (err: any) {
            setError(err.message || "Failed to create integration");
        }
    };

    const handleDeleteIntegration = async (filename: string) => {
        try {
            await api.deleteIntegrationFile(filename);
            await loadIntegrations();
            if (selectedFile === filename) {
                setSelectedFile(null);
                setContent("");
                setSources([]);
            }
            setDeletingIntegration(null);
        } catch (err: any) {
            setError(err.message || "Failed to delete integration");
        }
    };

    const handleCreateSource = async () => {
        if (!newSourceName) return;

        try {
            const integrationId = selectedFile
                ? selectedFile.replace(".yaml", "")
                : newSourceIntegration;

            await api.createSourceFile({
                name: newSourceName,
                integration_id: integrationId,
            });

            if (selectedFile) {
                const relatedSources =
                    await api.getIntegrationSources(selectedFile);
                setSources(relatedSources);
            }
            setShowNewSourceDialog(false);
            setNewSourceName("");
            setNewSourceIntegration("");

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
                if (selectedFile && content !== originalContent) {
                    handleSave();
                }
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [selectedFile, content, originalContent]);

    return (
        <TooltipProvider>
            <div className="flex h-full bg-background text-foreground">
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
                                    onOpenChange={setShowNewIntegrationDialog}
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
                                        <div className="py-4">
                                            <Input
                                                placeholder="filename.yaml"
                                                value={newFilename}
                                                onChange={(e) =>
                                                    setNewFilename(
                                                        e.target.value,
                                                    )
                                                }
                                            />
                                        </div>
                                        <DialogFooter>
                                            <Button
                                                variant="outline"
                                                onClick={() =>
                                                    setShowNewIntegrationDialog(
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
                            {integrations.map((file) => (
                                <Tooltip key={file}>
                                    <TooltipTrigger asChild>
                                        <button
                                            onClick={() =>
                                                loadIntegrationContent(file)
                                            }
                                            className={`h-10 w-10 flex items-center justify-center rounded-md transition-colors duration-150 ${selectedFile === file ? "bg-brand/20 text-brand" : "hover:bg-foreground hover:text-background text-muted-foreground"}`}
                                        >
                                            <FileJson className="h-5 w-5" />
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="right">
                                        {file}
                                    </TooltipContent>
                                </Tooltip>
                            ))}
                        </div>
                    ) : (
                        <div className="flex-1 overflow-y-auto p-2">
                            {integrations.map((file) => (
                                <div
                                    key={file}
                                    className={`group flex items-center justify-between p-2 rounded-md cursor-pointer mb-1 transition-colors duration-150 ${
                                        selectedFile === file
                                            ? "bg-brand/10 text-brand"
                                            : "hover:bg-foreground hover:text-background"
                                    }`}
                                    onClick={() => loadIntegrationContent(file)}
                                >
                                    <span className="text-sm truncate">
                                        {file}
                                    </span>
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
                            ))}
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
                                                className="h-8 w-8 bg-brand text-primary-foreground hover:bg-foreground hover:text-background transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand/50"
                                                onClick={handleSave}
                                                disabled={
                                                    saving ||
                                                    content === originalContent
                                                }
                                            >
                                                <Save className="h-4 w-4" />
                                            </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            {saving
                                                ? "Saving..."
                                                : "Save (Ctrl+S)"}
                                        </TooltipContent>
                                    </Tooltip>
                                </div>
                            </div>

                            {/* Editor */}
                            <div className="flex-1 overflow-hidden">
                                <Editor
                                    height="100%"
                                    defaultLanguage="yaml"
                                    value={content}
                                    onChange={(value) =>
                                        setContent(value || "")
                                    }
                                    theme={isDarkTheme ? "vs-dark" : "light"}
                                    options={{
                                        minimap: { enabled: false },
                                        fontSize: 14,
                                        wordWrap: "on",
                                        automaticLayout: true,
                                    }}
                                />
                            </div>

                            {/* Source Management Section */}
                            <div className="h-64 border-t border-border bg-surface/30 flex flex-col">
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
                                                <div>
                                                    <label className="text-sm font-medium">
                                                        Integration (Optional)
                                                    </label>
                                                    <Input
                                                        placeholder={selectedFile.replace(
                                                            ".yaml",
                                                            "",
                                                        )}
                                                        value={
                                                            newSourceIntegration ||
                                                            selectedFile.replace(
                                                                ".yaml",
                                                                "",
                                                            )
                                                        }
                                                        onChange={(e) =>
                                                            setNewSourceIntegration(
                                                                e.target.value,
                                                            )
                                                        }
                                                        className="mt-1"
                                                    />
                                                    <p className="text-xs text-muted-foreground mt-1">
                                                        Leave as the current
                                                        integration or change to
                                                        another.
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
