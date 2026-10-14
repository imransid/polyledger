import { type ReactNode, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { ErrorMessage } from '@/components/message';
import { text } from '@/i18n';

interface ConfirmButtonProps {
  label: string;
  question: string;
  onConfirm: () => Promise<unknown>;
  variant?: 'default' | 'outline' | 'destructive';
  /** For a bigger button than the usual small one. */
  className?: string;
  children?: ReactNode;
}

/** A button that asks first, for actions that are hard to take back. */
export function ConfirmButton({
  label,
  question,
  onConfirm,
  variant = 'outline',
  className,
  children,
}: ConfirmButtonProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function confirm() {
    setBusy(true);
    setError(undefined);
    try {
      await onConfirm();
      setOpen(false);
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : text.errors.unexpected,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant={variant} size="sm" className={className}>
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>{label}</AlertDialogTitle>
        <AlertDialogDescription>{question}</AlertDialogDescription>
        {children}
        <ErrorMessage message={error} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>
            {text.confirm.cancel}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(event) => {
              // Stay open until the API answers, to show its error if any.
              event.preventDefault();
              void confirm();
            }}
          >
            {text.confirm.yes}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
