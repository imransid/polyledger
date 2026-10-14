import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import type { Company } from '@/api/types';
import { ErrorMessage } from '@/components/message';
import { RecordPending } from '@/components/record-shell';
import { TextField } from '@/components/text-field';
import { text } from '@/i18n';
import { showApiError } from '@/lib/form-errors';
import { requiredText } from '@/lib/form-fields';
import { useWrite } from '@/lib/use-write';
import { FormFooter } from '@/master-data/record';
import { useCompany } from './use-company';

const words = text.settings;

const companyForm = z.object({
  name: requiredText(150),
  address: requiredText(300),
  phone: requiredText(100),
  bin: z
    .string()
    .trim()
    .refine((bin) => bin === '' || /^\d{13}$/.test(bin), words.binInvalid),
});

export function SettingsArea() {
  const company = useCompany();
  if (!company.data) {
    return <RecordPending error={company.error} />;
  }
  return <CompanyForm company={company.data} />;
}

function CompanyForm({ company }: { company: Company }) {
  const write = useWrite('settings');
  const [saved, setSaved] = useState(false);
  const form = useForm({
    resolver: zodResolver(companyForm),
    defaultValues: { ...company, bin: company.bin ?? '' },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async ({ bin, ...details }) => {
    setSaved(false);
    try {
      await unwrap(
        api.PUT('/settings/company', {
          body: { ...details, bin: bin === '' ? null : bin },
          headers: write.headers,
        }),
      );
      await write.done();
      setSaved(true);
    } catch (error) {
      showApiError(form, error, {
        name: 'name',
        address: 'address',
        phone: 'phone',
        bin: 'bin',
      });
    }
  });

  return (
    <div className="grid max-w-2xl gap-6">
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold">{words.title}</h1>
        <p className="text-sm text-muted-foreground">{words.intro}</p>
      </div>
      <form className="grid gap-4" onSubmit={submit} noValidate>
        <TextField
          label={words.name}
          error={errors.name?.message}
          {...form.register('name')}
        />
        <TextField
          label={words.address}
          error={errors.address?.message}
          {...form.register('address')}
        />
        <TextField
          label={words.phone}
          inputMode="tel"
          error={errors.phone?.message}
          {...form.register('phone')}
        />
        <TextField
          label={words.bin}
          inputMode="numeric"
          hint={words.binHint}
          error={errors.bin?.message}
          {...form.register('bin')}
        />
        <ErrorMessage message={errors.root?.message} />
        <FormFooter canEdit saving={isSubmitting} saved={saved} />
      </form>
    </div>
  );
}
