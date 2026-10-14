import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router';
import { z } from 'zod';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import { useAllLocations } from '@/api/lookups';
import type {
  Challan,
  Location,
  ReturnReason,
  ReturnSettlement,
} from '@/api/types';
import { ErrorMessage } from '@/components/message';
import { RecordPending, RecordShell } from '@/components/record-shell';
import { SelectField } from '@/components/select-field';
import { TextField } from '@/components/text-field';
import { Button } from '@/components/ui/button';
import { text } from '@/i18n';
import { showApiError } from '@/lib/form-errors';
import { formatPieces } from '@/lib/format';
import { useWrite } from '@/lib/use-write';
import { locationOptions } from '@/stock/lines';
import { useChallan } from './use-dispatch';

const words = text.dispatch;
const REASONS = Object.keys(words.reasons) as ReturnReason[];
const SETTLEMENTS = Object.keys(words.settlements) as ReturnSettlement[];

// A line may take back what the challan delivered less what came back
// before; a blank line takes nothing back.
function returnForm(limits: number[]) {
  return z.object({
    toLocationId: z.string().min(1, text.required),
    reason: z.enum(REASONS, { error: words.chooseReason }),
    settlement: z.enum(SETTLEMENTS, { error: words.chooseSettlement }),
    lines: z
      .array(z.object({ pieces: z.string().trim() }))
      .superRefine((lines, ctx) => {
        lines.forEach(({ pieces }, index) => {
          const message = !/^\d*$/.test(pieces)
            ? text.valid.wholeNumber
            : Number(pieces) > limits[index]
              ? words.tooMany(formatPieces(limits[index]))
              : undefined;
          if (message) {
            ctx.issues.push({
              code: 'custom',
              message,
              path: [index, 'pieces'],
              input: pieces,
            });
          }
        });
        if (lines.every(({ pieces }) => Number(pieces) === 0)) {
          ctx.issues.push({
            code: 'custom',
            message: words.noPieces,
            input: lines,
          });
        }
      }),
  });
}

export function ReturnPage() {
  const { id = '' } = useParams();
  const challan = useChallan(id);
  const locations = useAllLocations();
  if (!challan.data || !locations.data) {
    return <RecordPending error={challan.error ?? locations.error} />;
  }
  return (
    <ReturnForm
      challan={challan.data}
      destinations={locations.data.filter(
        (location) =>
          location.isActive &&
          (location.kind === 'FINISHED_GOODS_STORE' ||
            location.kind === 'SCRAP_YARD'),
      )}
    />
  );
}

function ReturnForm({
  challan,
  destinations,
}: {
  challan: Challan;
  destinations: Location[];
}) {
  const navigate = useNavigate();
  const write = useWrite('dispatch', 'sales-orders', 'stock');
  const lines = challan.lines
    .map((line) => ({ ...line, left: line.pieces - line.returnedPieces }))
    .filter((line) => line.left > 0);
  const form = useForm({
    resolver: zodResolver(returnForm(lines.map((line) => line.left))),
    defaultValues: {
      toLocationId: '',
      reason: '' as ReturnReason,
      settlement: '' as ReturnSettlement,
      lines: lines.map(() => ({ pieces: '' })),
    },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(
    async ({ lines: pieces, ...customerReturn }) => {
      try {
        await unwrap(
          api.POST('/dispatch/returns', {
            body: {
              ...customerReturn,
              challanId: challan.id,
              lines: lines
                .map((line, index) => ({
                  productId: line.productId,
                  pieces: Number(pieces[index].pieces),
                }))
                .filter((line) => line.pieces > 0),
            },
            headers: write.headers,
          }),
        );
        await write.created();
        navigate(`/dispatch/${challan.id}`);
      } catch (error) {
        showApiError(form, error, {
          toLocationId: 'toLocationId',
          reason: 'reason',
          settlement: 'settlement',
        });
      }
    },
  );

  return (
    <RecordShell title={words.returnTitle(challan.number)}>
      <form className="grid gap-4" onSubmit={submit} noValidate>
        {lines.map((line, index) => (
          <div
            key={line.productId}
            className="flex flex-wrap items-start gap-2"
          >
            <div className="min-w-56 flex-1 pt-6 text-sm">
              <p>
                <span className="font-medium">{line.code}</span> · {line.name}
              </p>
              <p className="text-muted-foreground">
                {words.canReturn(formatPieces(line.left))}
              </p>
            </div>
            <div className="w-36">
              <TextField
                label={words.returning(line.code)}
                inputMode="numeric"
                className="text-right tabular-nums"
                error={errors.lines?.[index]?.pieces?.message}
                {...form.register(`lines.${index}.pieces`)}
              />
            </div>
          </div>
        ))}
        <ErrorMessage
          message={errors.lines?.root?.message ?? errors.lines?.message}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label={words.destination}
            options={locationOptions(destinations)}
            error={errors.toLocationId?.message}
            {...form.register('toLocationId')}
          />
          <SelectField
            label={words.reason}
            options={[
              { value: '', label: words.chooseReason },
              ...REASONS.map((reason) => ({
                value: reason,
                label: words.reasons[reason],
              })),
            ]}
            error={errors.reason?.message}
            {...form.register('reason')}
          />
        </div>
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">
            {words.settlement}
          </legend>
          {SETTLEMENTS.map((settlement) => (
            <label key={settlement} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                value={settlement}
                className="mt-1"
                {...form.register('settlement')}
              />
              <span>
                <span className="font-medium">
                  {words.settlements[settlement]}
                </span>
                <span className="block text-muted-foreground">
                  {words.settlementHints[settlement]}
                </span>
              </span>
            </label>
          ))}
          {errors.settlement && (
            <p className="text-sm text-destructive">
              {errors.settlement.message}
            </p>
          )}
        </fieldset>
        <ErrorMessage message={errors.root?.message} />
        <div>
          <Button type="submit" disabled={isSubmitting}>
            {words.submitReturn}
          </Button>
        </div>
      </form>
    </RecordShell>
  );
}
