import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { useI18n } from "../../i18n";

interface CreateDashboardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string) => Promise<void> | void;
  existingNames: string[];
}

export function CreateDashboardDialog({
  open,
  onOpenChange,
  onCreate,
  existingNames,
}: CreateDashboardDialogProps) {
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      // Reset state when closing
      setName('');
      setError(null);
      setIsCreating(false);
    }
    onOpenChange(nextOpen);
  };

  const validate = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) {
      return t('dashboard.tabs.rename_empty');
    }
    const lower = trimmed.toLocaleLowerCase();
    const duplicate = existingNames.some(
      (existing) => existing.toLocaleLowerCase() === lower,
    );
    if (duplicate) {
      return t('dashboard.tabs.rename_duplicate');
    }
    return null;
  };

  const handleCreate = async () => {
    const validationError = validate(name);
    if (validationError) {
      setError(validationError);
      return;
    }
    setIsCreating(true);
    setError(null);
    try {
      await onCreate(name.trim());
      // Reset and close on success
      setName('');
      setError(null);
      handleOpenChange(false);
    } catch {
      setError(t('common.retryLater'));
    } finally {
      setIsCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isCreating) {
      void handleCreate();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('dashboard.management.edit_title')}</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={handleKeyDown}
            placeholder={t('dashboard.management.rename_placeholder')}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/50"
            autoFocus
            disabled={isCreating}
          />
          {error && (
            <p className="mt-2 text-sm text-destructive">{error}</p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isCreating}
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => void handleCreate()}
            disabled={isCreating}
          >
            {isCreating ? t('common.saving') : t('dashboard.management.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
