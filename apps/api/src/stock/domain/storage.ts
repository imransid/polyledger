import type {
  LocationKind,
  StockItemType,
} from '../../generated/prisma/client.js';

export function storageProblem(
  itemType: StockItemType,
  locationKind: LocationKind,
): string | null {
  if (itemType === 'PRODUCT' && locationKind === 'RAW_MATERIAL_STORE') {
    return 'Products cannot be stored in a raw material store';
  }
  if (itemType === 'RAW_MATERIAL' && locationKind === 'FINISHED_GOODS_STORE') {
    return 'Raw materials cannot be stored in a finished goods store';
  }
  return null;
}
