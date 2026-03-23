import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { AlertTriangle } from 'lucide-react';
import { useI18n } from "../../i18n";
import type { StoredView } from "../../types/config";

interface DeleteConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  view: StoredView | null;
  onConfirm: () => Promise<void> | void;
  isDeleting?: boolean;
}

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  view,
  onConfirm,
  isDeleting = false,
}: DeleteConfirmDialogProps) {
  const { t } = useI18n();

  const handleConfirm = async () => {
    try {
      await onConfirm();
      // Close on success
      onOpenChange(false);
    } catch {
      // Keep open on error so user can retry
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            {t('common.confirmDelete')}
          </DialogTitle>
          <DialogDescription>
            {t('dashboard.management.delete_confirm')}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <p className="text-sm font-medium">{view?.name}</p>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            {t('common.cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={() => void handleConfirm()}
            disabled={isDeleting}
          >
            {isDeleting ? t('common.saving') : t('dashboard.management.delete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
