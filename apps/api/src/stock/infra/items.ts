import { BadRequestException } from '@nestjs/common';
import type { QueryBus } from '@nestjs/cqrs';
import type { StockItemType } from '../../generated/prisma/client.js';
import { GetRawMaterialsQuery } from '../../materials/queries/get-raw-materials.js';
import { GetProductQuery } from '../../products/queries/get-product.js';
import type { StockItem } from '../domain/balance.js';

export interface ItemRef {
  itemType: StockItemType;
  itemId: string;
}

export function itemKey({ itemType, itemId }: ItemRef): string {
  return `${itemType}:${itemId}`;
}

export async function loadItems(
  queryBus: QueryBus,
  refs: ItemRef[],
): Promise<Map<string, StockItem>> {
  const items = new Map<string, StockItem>();
  const ids = (type: StockItemType) => [
    ...new Set(refs.filter((r) => r.itemType === type).map((r) => r.itemId)),
  ];

  const materialIds = ids('RAW_MATERIAL');
  if (materialIds.length > 0) {
    const materials = await queryBus.execute(
      new GetRawMaterialsQuery(materialIds),
    );
    for (const { id, code, isActive } of materials) {
      items.set(itemKey({ itemType: 'RAW_MATERIAL', itemId: id }), {
        type: 'RAW_MATERIAL',
        id,
        code,
        isActive,
      });
    }
  }
  for (const productId of ids('PRODUCT')) {
    const product = await queryBus.execute(new GetProductQuery(productId));
    if (product) {
      items.set(itemKey({ itemType: 'PRODUCT', itemId: product.id }), {
        type: 'PRODUCT',
        id: product.id,
        code: product.code,
        isActive: product.isActive,
        pieceWeightMg: product.pieceWeightMg,
      });
    }
  }

  for (const ref of refs) {
    if (!items.has(itemKey(ref))) {
      const label = ref.itemType === 'PRODUCT' ? 'product' : 'raw material';
      throw new BadRequestException(`Unknown ${label} ${ref.itemId}`);
    }
  }
  return items;
}

export function assertActive(items: Iterable<StockItem>): void {
  for (const item of items) {
    if (!item.isActive) {
      throw new BadRequestException(`${item.code} is inactive`);
    }
  }
}
