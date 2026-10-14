import { useState } from 'react';
import type { EquipmentStatus } from '@/api/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { text } from '@/i18n';
import { useWrite } from '@/lib/use-write';

export function ActiveBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge variant={isActive ? 'default' : 'secondary'}>
      {isActive ? text.record.active : text.record.inactive}
    </Badge>
  );
}

export function StatusBadge({ status }: { status: EquipmentStatus }) {
  return (
    <Badge variant={status === 'ACTIVE' ? 'default' : 'secondary'}>
      {text.masterData.statuses[status]}
    </Badge>
  );
}

interface FormFooterProps {
  canEdit: boolean;
  saving: boolean;
  saved: boolean;
}

export function FormFooter({ canEdit, saving, saved }: FormFooterProps) {
  if (!canEdit) {
    return (
      <p className="text-sm text-muted-foreground">{text.record.readOnly}</p>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <Button type="submit" disabled={saving}>
        {text.record.save}
      </Button>
      {saved && (
        <span className="text-sm text-muted-foreground">
          {text.record.saved}
        </span>
      )}
    </div>
  );
}

interface ActiveToggleProps {
  isActive: boolean;
  queryKey: string;
  setActive: (
    active: boolean,
    headers: Record<string, string>,
  ) => Promise<unknown>;
}

/** Deactivating keeps the record and its history; it only stops new use. */
export function ActiveToggle({
  isActive,
  queryKey,
  setActive,
}: ActiveToggleProps) {
  const write = useWrite(queryKey);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function toggle() {
    setBusy(true);
    setError(undefined);
    try {
      await setActive(!isActive, write.headers);
      await write.done();
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : text.errors.unexpected,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid justify-items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => void toggle()}
      >
        {isActive ? text.record.deactivate : text.record.reactivate}
      </Button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
