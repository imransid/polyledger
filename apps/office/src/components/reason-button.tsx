import { useState } from 'react';
import { ConfirmButton } from '@/components/confirm-button';
import { TextField } from '@/components/text-field';
import { text } from '@/i18n';

interface ReasonButtonProps {
  label: string;
  question: string;
  reasonLabel: string;
  onConfirm: (reason: string) => Promise<unknown>;
}

/** Asks first and needs a reason: cancelling, closing short, reversing. */
export function ReasonButton({
  label,
  question,
  reasonLabel,
  onConfirm,
}: ReasonButtonProps) {
  const [reason, setReason] = useState('');
  return (
    <ConfirmButton
      label={label}
      question={question}
      variant="destructive"
      onConfirm={async () => {
        if (reason.trim() === '') {
          throw new Error(text.orders.reasonRequired);
        }
        await onConfirm(reason.trim());
        setReason('');
      }}
    >
      <TextField
        label={reasonLabel}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
    </ConfirmButton>
  );
}
