import type { ReactNode } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';

/** A whole screen with one line on it: loading, or why nothing can show. */
export function FullPageMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-muted-foreground">
      {children}
    </div>
  );
}

export function ErrorMessage({ message }: { message?: string }) {
  if (!message) {
    return null;
  }
  // Invalid input comes back as one line per field.
  return (
    <Alert variant="destructive">
      <AlertDescription className="whitespace-pre-line">
        {message}
      </AlertDescription>
    </Alert>
  );
}
