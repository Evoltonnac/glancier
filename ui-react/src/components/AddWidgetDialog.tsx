import { useState, useEffect } from "react";
import { api } from "../api/client";
import { ViewComponent, SourceSummary } from "../types/config";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Check, LayoutDashboard } from "lucide-react";

interface AddWidgetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddWidget: (sourceId: string, template: ViewComponent) => void;
}

export function AddWidgetDialog({
  open,
  onOpenChange,
  onAddWidget,
}: AddWidgetDialogProps) {
  const [sources, setSources] = useState<SourceSummary[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string>("");

  const [templates, setTemplates] = useState<ViewComponent[]>([]);
  const [selectedTemplateIdx, setSelectedTemplateIdx] = useState<number>(-1);

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      // Reset state
      setSelectedSourceId("");
      setTemplates([]);
      setSelectedTemplateIdx(-1);

      // Load sources
      api.getSources().then(setSources).catch(console.error);
    }
  }, [open]);

  // When a source is selected, fetch its integration templates
  useEffect(() => {
    if (!selectedSourceId) return;

    // In the current backend, the source summary doesn't return the integration_id directly
    // We'll have to fetch the integration files or have an endpoint.
    // Wait, does getSource() give integration id?
    // The list_sources API doesn't include integration_id right now.
    // We might need to fetch the sources again or just assume we have integration models

    // Let's get the full source config if needed. Since we only have /sources
    // returning SourceSummary without integration_id in the API, we need a way to get templates.
    // Actually, we can just fetch the integration_id from the source config? Let's check api.py
    // In api.py list_sources only returns minimal data. Let's add an endpoint or fetch from stored sources.

    const loadTemplates = async () => {
      setLoading(true);
      try {
        // Fetch the integration_id from the already loaded sources summary
        const source = sources.find((s) => s.id === selectedSourceId);

        if (source && source.integration_id) {
          const tpls = await api.getIntegrationTemplates(source.integration_id);
          setTemplates(tpls);
        } else {
          setTemplates([]); // Source has no integration_id
        }
      } catch (err) {
        console.error("Failed to load templates", err);
        setTemplates([]);
      } finally {
        setLoading(false);
      }
    };

    loadTemplates();
    setSelectedTemplateIdx(-1);
  }, [selectedSourceId]);

  const handleAdd = () => {
    if (selectedSourceId && selectedTemplateIdx >= 0) {
      onAddWidget(selectedSourceId, templates[selectedTemplateIdx]);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>添加小组件</DialogTitle>
          <DialogDescription>
            从已配置的数据源中选择一个模版，将其添加到当前监控面板。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">选择数据源</label>
            <Select
              value={selectedSourceId}
              onValueChange={setSelectedSourceId}
            >
              <SelectTrigger>
                <SelectValue placeholder="请选择你要展示的数据源..." />
              </SelectTrigger>
              <SelectContent>
                {sources.map((source) => (
                  <SelectItem key={source.id} value={source.id}>
                    <div className="flex items-center gap-2">
                      {source.name}
                      {source.error && (
                        <span className="text-xs text-destructive">(异常)</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedSourceId && (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">选择展示模版</label>

              {loading ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  加载模版中...
                </div>
              ) : templates.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground bg-secondary/20 rounded-md border border-dashed">
                  该数据源的集成配置未提供任何展示模版。
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-2">
                  {templates.map((tpl, idx) => (
                    <Card
                      key={idx}
                      className={`cursor-pointer transition-all ${
                        selectedTemplateIdx === idx
                          ? "bg-primary text-primary-foreground shadow-md border-primary"
                          : "border-border hover:border-border/80 hover:shadow-soft-elevation hover:-translate-y-0.5"
                      } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
                      onClick={() => setSelectedTemplateIdx(idx)}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedTemplateIdx(idx);
                        }
                      }}
                    >
                      <CardHeader className="p-3 pb-2 flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-sm font-medium">
                          {tpl.label || tpl.type}
                        </CardTitle>
                        {selectedTemplateIdx === idx ? (
                          <Check className="h-4 w-4 text-primary-foreground" />
                        ) : (
                          <LayoutDashboard className="h-4 w-4 text-muted-foreground" />
                        )}
                      </CardHeader>
                      <CardContent className="p-3 pt-0">
                        <CardDescription className={`text-xs truncate ${selectedTemplateIdx === idx ? "text-primary-foreground/80" : ""}`}>
                          类型: {tpl.type}
                        </CardDescription>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            disabled={!selectedSourceId || selectedTemplateIdx < 0}
            onClick={handleAdd}
          >
            添加到视图
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
