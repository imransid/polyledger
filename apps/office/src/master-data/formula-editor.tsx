import { zodResolver } from '@hookform/resolvers/zod';
import { requiredMaterial, WHOLE_IN_BASIS_POINTS } from '@polyledger/shared';
import { Plus, X } from 'lucide-react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import type { RawMaterial } from '@/api/types';
import { ErrorMessage } from '@/components/message';
import { SelectField } from '@/components/select-field';
import { TextField } from '@/components/text-field';
import { Button } from '@/components/ui/button';
import { text } from '@/i18n';
import { formatDecimal, parseDecimal } from '@/lib/decimal';
import { showApiError } from '@/lib/form-errors';
import { decimal } from '@/lib/form-fields';
import { formatPercent, formatWeight } from '@/lib/format';

const words = text.formulas;
const PREVIEW_PIECES = 1_000;

export interface FormulaLine {
  rawMaterialId: string;
  basisPoints: number;
}

export interface Formula {
  wasteBasisPoints: number;
  lines: FormulaLine[];
}

const formulaForm = z.object({
  waste: decimal(2, text.valid.percent),
  lines: z
    .array(
      z.object({
        rawMaterialId: z.string().min(1, text.required),
        percent: decimal(2, text.valid.percent),
      }),
    )
    .min(1),
});

interface FormulaEditorProps {
  pieceWeightMg: number;
  /** The materials a new version may use: the active ones. */
  materials: RawMaterial[];
  startFrom?: Formula;
  onSave: (formula: Formula) => Promise<void>;
}

export function FormulaEditor({
  pieceWeightMg,
  materials,
  startFrom,
  onSave,
}: FormulaEditorProps) {
  const defaults = {
    waste: startFrom ? formatDecimal(startFrom.wasteBasisPoints, 2) : '0',
    lines: startFrom
      ? startFrom.lines.map((line) => ({
          rawMaterialId: line.rawMaterialId,
          percent: formatDecimal(line.basisPoints, 2),
        }))
      : [{ rawMaterialId: '', percent: '' }],
  };
  const form = useForm({
    resolver: zodResolver(formulaForm),
    defaultValues: defaults,
  });
  const lines = useFieldArray({ control: form.control, name: 'lines' });
  const watched = useWatch({ control: form.control });
  const { errors, isSubmitting } = form.formState;

  const shares = (watched.lines ?? []).map((line) =>
    parseDecimal(line.percent ?? '', 2),
  );
  const total = shares.every((share) => share !== null)
    ? shares.reduce<number>((sum, share) => sum + (share ?? 0), 0)
    : null;
  const complete = total === WHOLE_IN_BASIS_POINTS;
  const waste = parseDecimal(watched.waste ?? '', 2);
  const materialOptions = [
    { value: '', label: words.chooseMaterial },
    ...materials.map((material) => ({
      value: material.id,
      label: `${material.code} · ${material.name}`,
    })),
  ];

  const submit = form.handleSubmit(async (values) => {
    try {
      await onSave({
        wasteBasisPoints: values.waste,
        lines: values.lines.map((line) => ({
          rawMaterialId: line.rawMaterialId,
          basisPoints: line.percent,
        })),
      });
      form.reset(defaults);
    } catch (error) {
      showApiError(form, error, { wasteBasisPoints: 'waste' });
    }
  });

  return (
    <form className="grid gap-4" onSubmit={submit} noValidate>
      <TextField
        label={words.wastePercent}
        inputMode="decimal"
        className="max-w-32"
        error={errors.waste?.message}
        {...form.register('waste')}
      />
      {lines.fields.map((field, index) => (
        <div key={field.id} className="flex items-end gap-2">
          <div className="flex-1">
            <SelectField
              label={words.material}
              options={materialOptions}
              error={errors.lines?.[index]?.rawMaterialId?.message}
              {...form.register(`lines.${index}.rawMaterialId`)}
            />
          </div>
          <div className="w-28">
            <TextField
              label={words.percent}
              inputMode="decimal"
              error={errors.lines?.[index]?.percent?.message}
              {...form.register(`lines.${index}.percent`)}
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={words.removeLine}
            disabled={lines.fields.length === 1}
            onClick={() => lines.remove(index)}
          >
            <X />
          </Button>
        </div>
      ))}
      <div className="flex items-center justify-between gap-4">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => lines.append({ rawMaterialId: '', percent: '' })}
        >
          <Plus />
          {words.addLine}
        </Button>
        <p
          className={complete ? 'font-medium' : 'font-medium text-destructive'}
          data-testid="formula-total"
        >
          {words.total(total === null ? '—' : formatPercent(total))}
        </p>
      </div>
      {!complete && (
        <p className="text-sm text-muted-foreground">{words.mustBe100}</p>
      )}
      {complete && waste !== null && (
        <Preview
          pieceWeightMg={pieceWeightMg}
          wasteBasisPoints={waste}
          lines={(watched.lines ?? []).map((line, index) => ({
            label:
              materials.find((material) => material.id === line.rawMaterialId)
                ?.code ?? '—',
            basisPoints: shares[index] ?? 0,
          }))}
        />
      )}
      <ErrorMessage message={errors.root?.message} />
      <div>
        <Button type="submit" disabled={!complete || isSubmitting}>
          {words.save}
        </Button>
      </div>
    </form>
  );
}

interface PreviewProps {
  pieceWeightMg: number;
  wasteBasisPoints: number;
  lines: { label: string; basisPoints: number }[];
}

// The same arithmetic the API uses to suggest an issue slip, so what the
// planner sees here is what the store will be asked for.
function Preview({ pieceWeightMg, wasteBasisPoints, lines }: PreviewProps) {
  const need = requiredMaterial({
    pieces: PREVIEW_PIECES,
    pieceWeightMg,
    wasteBasisPoints,
    lineBasisPoints: lines.map((line) => line.basisPoints),
  });
  return (
    <div
      className="grid gap-1 rounded-md border p-3 text-sm"
      data-testid="formula-preview"
    >
      <p className="text-muted-foreground">
        {words.preview(String(PREVIEW_PIECES), formatPercent(wasteBasisPoints))}
      </p>
      {lines.map((line, index) => (
        <p key={index} className="flex justify-between gap-4">
          <span>{line.label}</span>
          <span>{formatWeight(need.lines[index])}</span>
        </p>
      ))}
      <p className="flex justify-between gap-4 font-medium">
        <span>{words.previewTotal}</span>
        <span>{formatWeight(need.total)}</span>
      </p>
    </div>
  );
}
