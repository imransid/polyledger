import { X } from 'lucide-react';
import { type ComponentProps, type ReactNode, useId } from 'react';
import type { FieldError, UseFormRegisterReturn } from 'react-hook-form';
import type { Product, RawMaterial, StockItemType } from '@/api/types';
import { TextField } from '@/components/text-field';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { text } from '@/i18n';
import { cn } from '@/lib/utils';
import { itemValue } from './lines';

const words = text.stock;

const selectClass =
  'h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive';

type ItemSelectProps = ComponentProps<'select'> & {
  error?: string;
  materials: RawMaterial[];
  products: Product[];
};

/** Raw materials and products in one select, grouped. */
export function ItemSelect({
  error,
  materials,
  products,
  ...select
}: ItemSelectProps) {
  const id = useId();
  const option = (
    itemType: StockItemType,
    item: { id: string; code: string; name: string },
  ) => (
    <option key={item.id} value={itemValue({ itemType, itemId: item.id })}>
      {item.code} · {item.name}
    </option>
  );
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{words.item}</Label>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        className={selectClass}
        {...select}
      >
        <option value="">{words.chooseItem}</option>
        {materials.length > 0 && (
          <optgroup label={words.rawMaterials}>
            {materials.map((material) => option('RAW_MATERIAL', material))}
          </optgroup>
        )}
        {products.length > 0 && (
          <optgroup label={words.products}>
            {products.map((product) => option('PRODUCT', product))}
          </optgroup>
        )}
      </select>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

interface StockLineFieldsProps {
  item: ReactNode;
  quantityLabel: string;
  itemType?: StockItemType;
  quantity: UseFormRegisterReturn;
  quantityError?: FieldError;
  /** Next to the quantity: what is available, or the difference. */
  info?: ReactNode;
  onRemove?: () => void;
}

export function StockLineFields({
  item,
  quantityLabel,
  itemType,
  quantity,
  quantityError,
  info,
  onRemove,
}: StockLineFieldsProps) {
  const unit = itemType === 'PRODUCT' ? words.pieces : words.kilograms;
  return (
    <div className="flex flex-wrap items-start gap-2">
      <div className="min-w-64 flex-1">{item}</div>
      <div className="w-36">
        <TextField
          label={`${quantityLabel} (${unit})`}
          inputMode={itemType === 'PRODUCT' ? 'numeric' : 'decimal'}
          className="text-right tabular-nums"
          error={quantityError?.message}
          {...quantity}
        />
      </div>
      <div className="min-w-44 pt-8 text-right text-sm tabular-nums">
        {info}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="mt-6"
        aria-label={words.removeLine}
        disabled={!onRemove}
        onClick={onRemove}
      >
        <X />
      </Button>
    </div>
  );
}

/** Red when a line asks for something it can't have. */
export function LineInfo({
  children,
  problem,
}: {
  children: ReactNode;
  problem?: boolean;
}) {
  return (
    <span className={cn(problem && 'font-medium text-destructive')}>
      {children}
    </span>
  );
}
