import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { api } from '@/api/client';
import { unwrap } from '@/api/errors';
import {
  useAllLocations,
  useAllRawMaterials,
  useOperators,
} from '@/api/lookups';
import type {
  JobCard,
  Location,
  Operator,
  ProductionEntry,
  RawMaterial,
  Shift,
  WasteEntry,
  WasteType,
} from '@/api/types';
import {
  ENTRY_RECORDERS,
  FLOOR_LEADS,
  PRODUCTION_READERS,
} from '@/auth/permissions';
import { useUser } from '@/auth/use-session';
import { DataTable } from '@/components/data-table';
import { ErrorMessage } from '@/components/message';
import { ReasonButton } from '@/components/reason-button';
import { SelectField } from '@/components/select-field';
import { TextField } from '@/components/text-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { text } from '@/i18n';
import { factoryToday } from '@/lib/dates';
import { parseDecimal } from '@/lib/decimal';
import { showApiError } from '@/lib/form-errors';
import { wholeNumber } from '@/lib/form-fields';
import { formatDay, formatPieces, formatWeight } from '@/lib/format';
import { useWrite } from '@/lib/use-write';
import { Warnings } from './parts';

const words = text.production;
const SHIFTS: Shift[] = ['A', 'B', 'C'];
const WASTE_TYPES = Object.keys(words.wasteTypes) as WasteType[];

export function ShiftsTab({ card }: { card: JobCard }) {
  const { role } = useUser();
  const reads = PRODUCTION_READERS.includes(role);
  const records = ENTRY_RECORDERS.includes(role);
  const inWork = card.status === 'RELEASED' || card.status === 'RUNNING';
  const entries = useQuery({
    queryKey: ['job-cards', 'entries', card.id],
    enabled: reads,
    queryFn: () =>
      unwrap(
        api.GET('/job-cards/{id}/entries', {
          params: { path: { id: card.id } },
        }),
      ),
  });
  const lastShotEnd = entries.data
    ?.filter((entry) => !entry.reversedAt)
    .at(-1)?.shotEnd;
  return (
    <div className="grid gap-6">
      {reads && entries.data && (
        <EntryTable card={card} entries={entries.data} />
      )}
      {records && inWork && (
        <RecordEntry
          key={lastShotEnd ?? 'first'}
          card={card}
          shotStart={lastShotEnd}
        />
      )}
      {reads && <WasteTable card={card} />}
      {records && inWork && <RecordWasteLoader card={card} />}
    </div>
  );
}

function EntryTable({
  card,
  entries,
}: {
  card: JobCard;
  entries: ProductionEntry[];
}) {
  const operators = useOperators();
  const canReverse = FLOOR_LEADS.includes(useUser().role);
  const write = useWrite('job-cards', 'stock');
  const name = (id: string) =>
    operators.data?.find((operator) => operator.id === id)?.name ?? '';
  return (
    <section className="grid gap-2">
      <h2 className="font-semibold">{words.entries}</h2>
      <DataTable<ProductionEntry>
        rows={entries}
        rowKey={(entry) => entry.id}
        columns={[
          {
            header: words.shiftDate,
            cell: (entry) => formatDay(entry.shiftDate),
          },
          { header: words.shift, cell: (entry) => entry.shift },
          { header: words.operator, cell: (entry) => name(entry.operatorId) },
          {
            header: words.shotStart,
            numeric: true,
            cell: (entry) => `${entry.shotStart} – ${entry.shotEnd}`,
          },
          {
            header: words.good,
            numeric: true,
            cell: (entry) => formatPieces(entry.goodPieces),
          },
          {
            header: words.rejected,
            numeric: true,
            cell: (entry) => formatPieces(entry.rejectedPieces),
          },
          {
            header: '',
            cell: (entry) => <Warnings warnings={entry.warnings} />,
          },
          {
            header: text.masterData.status,
            cell: (entry) =>
              entry.reversedAt ? (
                <Badge variant="secondary">{words.reversed}</Badge>
              ) : (
                canReverse && (
                  <ReasonButton
                    label={words.reverse}
                    question={words.confirmReverse}
                    reasonLabel={words.reverseReason}
                    onConfirm={async (reason) => {
                      await unwrap(
                        api.POST('/job-cards/{id}/entries/{entryId}/reverse', {
                          params: { path: { id: card.id, entryId: entry.id } },
                          body: { reason },
                          headers: write.headers,
                        }),
                      );
                      await write.done();
                    }}
                  />
                )
              ),
          },
        ]}
      />
    </section>
  );
}

const entryForm = z
  .object({
    shiftDate: z.iso.date(text.required),
    shift: z.enum(SHIFTS),
    operatorId: z.string().min(1, text.required),
    shotStart: wholeNumber(),
    shotEnd: wholeNumber(),
    goodPieces: wholeNumber(),
    rejectedPieces: wholeNumber(),
  })
  .refine((entry) => entry.shotEnd >= entry.shotStart, {
    message: text.valid.shotCounterBackwards,
    path: ['shotEnd'],
  });

function RecordEntry({
  card,
  shotStart,
}: {
  card: JobCard;
  shotStart?: number;
}) {
  const user = useUser();
  const operators = useOperators();
  const write = useWrite('job-cards', 'stock', 'production');
  const [warnings, setWarnings] = useState<string[]>();
  // An operator records their own shift; the API refuses anyone else.
  const isOperator = user.role === 'OPERATOR';
  const form = useForm({
    resolver: zodResolver(entryForm),
    defaultValues: {
      shiftDate: factoryToday(),
      shift: 'A' as Shift,
      operatorId: isOperator ? user.id : '',
      shotStart: shotStart === undefined ? '' : String(shotStart),
      shotEnd: '',
      goodPieces: '',
      rejectedPieces: '0',
    },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (entry) => {
    try {
      const recorded = await unwrap(
        api.POST('/job-cards/{id}/entries', {
          params: { path: { id: card.id } },
          body: entry,
          headers: write.headers,
        }),
      );
      setWarnings(recorded.warnings);
      await write.done();
      form.reset({
        ...form.getValues(),
        shotStart: String(entry.shotEnd),
        shotEnd: '',
        goodPieces: '',
        rejectedPieces: '0',
      });
    } catch (error) {
      setWarnings(undefined);
      showApiError(form, error, {
        shiftDate: 'shiftDate',
        shift: 'shift',
        operatorId: 'operatorId',
        shotStart: 'shotStart',
        shotEnd: 'shotEnd',
        goodPieces: 'goodPieces',
        rejectedPieces: 'rejectedPieces',
      });
    }
  });

  const operatorOptions = (list: Operator[]) => [
    { value: '', label: words.chooseOperator },
    ...list.map((operator) => ({ value: operator.id, label: operator.name })),
  ];

  return (
    <section className="grid gap-3">
      <h2 className="font-semibold">{words.record}</h2>
      {warnings &&
        (warnings.length > 0 ? (
          <Warnings warnings={warnings} />
        ) : (
          <p className="text-sm text-muted-foreground">{words.recorded}</p>
        ))}
      <form className="grid gap-3 sm:grid-cols-4" onSubmit={submit} noValidate>
        <TextField
          label={words.shiftDate}
          type="date"
          error={errors.shiftDate?.message}
          {...form.register('shiftDate')}
        />
        <SelectField
          label={words.shift}
          options={SHIFTS.map((shift) => ({ value: shift, label: shift }))}
          error={errors.shift?.message}
          {...form.register('shift')}
        />
        {isOperator ? (
          <TextField label={words.operator} value={user.name} readOnly />
        ) : (
          <SelectField
            label={words.operator}
            options={operatorOptions(operators.data ?? [])}
            error={errors.operatorId?.message}
            {...form.register('operatorId')}
          />
        )}
        <div />
        {(
          ['shotStart', 'shotEnd', 'goodPieces', 'rejectedPieces'] as const
        ).map((field) => (
          <TextField
            key={field}
            label={
              {
                shotStart: words.shotStart,
                shotEnd: words.shotEnd,
                goodPieces: words.good,
                rejectedPieces: words.rejected,
              }[field]
            }
            inputMode="numeric"
            className="text-right tabular-nums"
            error={errors[field]?.message}
            {...form.register(field)}
          />
        ))}
        <ErrorMessage message={errors.root?.message} />
        <div className="sm:col-span-4">
          <Button type="submit" disabled={isSubmitting}>
            {words.record}
          </Button>
        </div>
      </form>
    </section>
  );
}

function WasteTable({ card }: { card: JobCard }) {
  const canReverse = FLOOR_LEADS.includes(useUser().role);
  const write = useWrite('job-cards', 'stock');
  const waste = useQuery({
    queryKey: ['job-cards', 'waste', card.id],
    queryFn: () =>
      unwrap(
        api.GET('/job-cards/{id}/waste', { params: { path: { id: card.id } } }),
      ),
  });
  if (!waste.data || waste.data.length === 0) {
    return null;
  }
  return (
    <section className="grid gap-2">
      <h2 className="font-semibold">{words.waste}</h2>
      <DataTable<WasteEntry>
        rows={waste.data}
        rowKey={(entry) => entry.id}
        columns={[
          {
            header: words.shiftDate,
            cell: (entry) => formatDay(entry.shiftDate),
          },
          { header: words.shift, cell: (entry) => entry.shift },
          ...WASTE_TYPES.map((type) => ({
            header: words.wasteTypes[type],
            numeric: true,
            cell: (entry: WasteEntry) => {
              const line = entry.lines.find((l) => l.wasteType === type);
              return line ? formatWeight(line.grams) : '';
            },
          })),
          {
            header: text.masterData.status,
            cell: (entry) =>
              entry.reversedAt ? (
                <Badge variant="secondary">{words.reversed}</Badge>
              ) : (
                canReverse && (
                  <ReasonButton
                    label={words.reverse}
                    question={words.confirmReverse}
                    reasonLabel={words.reverseReason}
                    onConfirm={async (reason) => {
                      await unwrap(
                        api.POST('/job-cards/{id}/waste/{entryId}/reverse', {
                          params: { path: { id: card.id, entryId: entry.id } },
                          body: { reason },
                          headers: write.headers,
                        }),
                      );
                      await write.done();
                    }}
                  />
                )
              ),
          },
        ]}
      />
    </section>
  );
}

function RecordWasteLoader({ card }: { card: JobCard }) {
  const materials = useAllRawMaterials();
  const locations = useAllLocations();
  if (!materials.data || !locations.data) {
    return null;
  }
  return (
    <RecordWaste
      card={card}
      regrinds={materials.data.filter(
        (m) => m.isActive && m.type === 'REGRIND',
      )}
      yards={locations.data.filter(
        (l) => l.isActive && l.kind === 'SCRAP_YARD',
      )}
    />
  );
}

const wasteForm = z
  .object({
    shiftDate: z.iso.date(text.required),
    shift: z.enum(SHIFTS),
    wasteMaterialId: z.string().min(1, text.required),
    scrapLocationId: z.string().min(1, text.required),
    kilograms: z.array(
      z
        .string()
        .refine(
          (kg) => kg.trim() === '' || parseDecimal(kg, 3) !== null,
          text.valid.kilograms,
        ),
    ),
  })
  .refine(
    (waste) => waste.kilograms.some((kg) => (parseDecimal(kg, 3) ?? 0) > 0),
    {
      message: words.noWaste,
      path: ['kilograms'],
    },
  );

interface RecordWasteProps {
  card: JobCard;
  regrinds: RawMaterial[];
  yards: Location[];
}

function RecordWaste({ card, regrinds, yards }: RecordWasteProps) {
  const write = useWrite('job-cards', 'stock');
  const [recorded, setRecorded] = useState(false);
  const form = useForm({
    resolver: zodResolver(wasteForm),
    defaultValues: {
      shiftDate: factoryToday(),
      shift: 'A' as Shift,
      wasteMaterialId: regrinds.length === 1 ? regrinds[0].id : '',
      scrapLocationId: yards.length === 1 ? yards[0].id : '',
      kilograms: WASTE_TYPES.map(() => ''),
    },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async ({ kilograms, ...waste }) => {
    setRecorded(false);
    try {
      await unwrap(
        api.POST('/job-cards/{id}/waste', {
          params: { path: { id: card.id } },
          body: {
            ...waste,
            lines: WASTE_TYPES.map((wasteType, index) => ({
              wasteType,
              kilograms: kilograms[index].trim(),
            })).filter((line) => (parseDecimal(line.kilograms, 3) ?? 0) > 0),
          },
          headers: write.headers,
        }),
      );
      setRecorded(true);
      await write.done();
      form.reset({ ...form.getValues(), kilograms: WASTE_TYPES.map(() => '') });
    } catch (error) {
      showApiError(form, error, {
        shiftDate: 'shiftDate',
        shift: 'shift',
        wasteMaterialId: 'wasteMaterialId',
        scrapLocationId: 'scrapLocationId',
      });
    }
  });

  return (
    <section className="grid gap-3">
      <h2 className="font-semibold">{words.recordWaste}</h2>
      {recorded && (
        <p className="text-sm text-muted-foreground">{words.recorded}</p>
      )}
      <form className="grid gap-3 sm:grid-cols-4" onSubmit={submit} noValidate>
        <TextField
          label={words.shiftDate}
          type="date"
          error={errors.shiftDate?.message}
          {...form.register('shiftDate')}
        />
        <SelectField
          label={words.shift}
          options={SHIFTS.map((shift) => ({ value: shift, label: shift }))}
          {...form.register('shift')}
        />
        <SelectField
          label={words.wasteMaterial}
          options={[
            { value: '', label: words.chooseRegrind },
            ...regrinds.map((m) => ({
              value: m.id,
              label: `${m.code} · ${m.name}`,
            })),
          ]}
          error={errors.wasteMaterialId?.message}
          {...form.register('wasteMaterialId')}
        />
        <SelectField
          label={words.scrapYard}
          options={[
            { value: '', label: text.stock.chooseLocation },
            ...yards.map((y) => ({
              value: y.id,
              label: `${y.code} · ${y.name}`,
            })),
          ]}
          error={errors.scrapLocationId?.message}
          {...form.register('scrapLocationId')}
        />
        {WASTE_TYPES.map((type, index) => (
          <TextField
            key={type}
            label={words.wasteTypes[type]}
            inputMode="decimal"
            className="text-right tabular-nums"
            error={errors.kilograms?.[index]?.message}
            {...form.register(`kilograms.${index}`)}
          />
        ))}
        <ErrorMessage
          message={errors.kilograms?.root?.message ?? errors.kilograms?.message}
        />
        <ErrorMessage message={errors.root?.message} />
        <div className="sm:col-span-4">
          <Button type="submit" disabled={isSubmitting}>
            {words.recordWaste}
          </Button>
        </div>
      </form>
    </section>
  );
}
