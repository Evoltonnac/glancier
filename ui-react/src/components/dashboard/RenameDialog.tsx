import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { useI18n } from "../../i18n";
import type { StoredView } from "../../types/config";

interface RenameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  view: StoredView | null;
  onRename: (viewId: string, newName: string) => Promise<void> | void;
  existingNames: string[];
  isRenaming?: boolean;
}

export function RenameDialog({
  open,
  onOpenChange,
  view,
  onRename,
  existingNames,
  isRenaming = false,
}: RenameDialogProps) {
  const { t } = useI18n();
  const [draftName, setDraftName] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Initialize draftName with view.name when dialog opens
  useEffect(() => {
    if (open && view) {
      setDraftName(view.name);
      setError(null);
    }
  }, [open, view]);

  const validate = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) {
      return t('dashboard.tabs.rename_empty');
    }
    const lower = trimmed.toLocaleLowerCase();
    const duplicate = existingNames.some((existing) => {
      // Exclude the current view's own name from duplicate check
      if (view && existing.toLocaleLowerCase() === view.name.toLocaleLowerCase()) {
        return false;
      }
      return existing.toLocaleLowerCase() === lower;
    });
    if (duplicate) {
      return t('dashboard.tabs.rename_duplicate');
    }
    return null;
  };

  const handleRename = async () => {
    if (!view) return;
    const validationError = validate(draftName);
    if (validationError) {
      setError(validationError);
      return;
    }
    try {
      await onRename(view.id, draftName.trim());
      onOpenChange(false);
    } catch {
      setError(t('common.retryLater'));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isRenaming) {
      void handleRename();
    } else if (e.key === 'Escape') {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('dashboard.management.edit_title')}</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <input
            type="text"
            value={draftName}
            onChange={(e) => {
              setDraftName(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder={t('dashboard.management.rename_placeholder')}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/50"
            autoFocus
            disabled={isRenaming}
          />
          {error && (
            <p className="mt-2 text-sm text-destructive">{error}</p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isRenaming}
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => void handleRename()}
            disabled={isRenaming}
          >
            {isRenaming ? t('common.saving') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
