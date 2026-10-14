import type {
  Balance,
  CurrentUser,
  FormulaVersion,
  Location,
  Machine,
  Mould,
  Page,
  Partner,
  Product,
  RawMaterial,
  Role,
  StockCardLine,
  StockDocument,
  User,
} from '@/api/types';

const stamps = {
  createdAt: '2026-10-14T04:00:00.000Z',
  updatedAt: '2026-10-14T04:00:00.000Z',
};

export function page<T>(items: T[]): Page<T> {
  return { items, total: items.length, page: 1, pageSize: 25 };
}

export function signedIn(role: Role): CurrentUser {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'Nasrin Akter',
    email: 'nasrin@example.com',
    phone: null,
    role,
    isActive: true,
    ...stamps,
  };
}

export const rawMaterial = (
  fields: Partial<RawMaterial> = {},
): RawMaterial => ({
  id: '00000000-0000-4000-8000-0000000000a1',
  code: 'RM-PP-01',
  name: 'PP homopolymer',
  type: 'RESIN',
  minimumStockGrams: 500_000,
  isActive: true,
  ...stamps,
  ...fields,
});

export const product = (fields: Partial<Product> = {}): Product => ({
  id: '00000000-0000-4000-8000-0000000000b1',
  code: 'CAP-28',
  name: '28 mm bottle cap',
  pieceWeightMg: 2_500,
  colour: 'White',
  piecesPerCarton: 2_000,
  isActive: true,
  ...stamps,
  ...fields,
});

export const mould = (fields: Partial<Mould> = {}): Mould => ({
  id: '00000000-0000-4000-8000-0000000000c1',
  code: 'M-CAP28-24',
  name: '28 mm cap, 24 cavities',
  cavities: 24,
  cycleTimeTenths: 85,
  runnerWeightMg: 18_000,
  productId: product().id,
  status: 'ACTIVE',
  ...stamps,
  ...fields,
});

export const machine = (fields: Partial<Machine> = {}): Machine => ({
  id: '00000000-0000-4000-8000-0000000000d1',
  code: 'IM-01',
  name: 'Haitian MA1600',
  tonnage: 160,
  status: 'ACTIVE',
  ...stamps,
  ...fields,
});

export const partner = (fields: Partial<Partner> = {}): Partner => ({
  id: '00000000-0000-4000-8000-0000000000e1',
  code: 'CUS-PADMA',
  name: 'Padma Drinks Ltd',
  phone: '+8801711000101',
  address: 'Tongi, Gazipur',
  isActive: true,
  ...stamps,
  ...fields,
});

export const formulaVersion = (
  fields: Partial<FormulaVersion> = {},
): FormulaVersion => ({
  id: '00000000-0000-4000-8000-0000000000f1',
  productId: product().id,
  version: 1,
  wasteBasisPoints: 300,
  isActive: true,
  createdAt: stamps.createdAt,
  lines: [{ rawMaterialId: rawMaterial().id, basisPoints: 10_000 }],
  ...fields,
});

export const user = (fields: Partial<User> = {}): User => ({
  ...signedIn('OPERATOR'),
  id: '00000000-0000-4000-8000-000000000002',
  name: 'Shahin Alam',
  email: null,
  phone: '+8801811000202',
  ...fields,
});

export const location = (fields: Partial<Location> = {}): Location => ({
  id: '00000000-0000-4000-8000-000000000101',
  code: 'RM-STORE',
  name: 'Main raw material store',
  kind: 'RAW_MATERIAL_STORE',
  isActive: true,
  ...stamps,
  ...fields,
});

export const stockDocument = (
  fields: Partial<StockDocument> = {},
): StockDocument => ({
  id: '00000000-0000-4000-8000-000000000201',
  number: 'GRN-000001',
  kind: 'RECEIPT',
  supplierId: null,
  supplierReference: null,
  receivedOn: null,
  reason: null,
  reversesId: null,
  reversedAt: null,
  jobCardId: null,
  postedById: signedIn('STOREKEEPER').id,
  postedAt: '2026-10-14T05:30:00.000Z',
  postedByName: 'Rafiqul Islam',
  reversible: true,
  entries: [],
  receiptLines: [],
  ...fields,
});

export const balance = (fields: Partial<Balance> = {}): Balance => ({
  itemType: 'RAW_MATERIAL',
  itemId: rawMaterial().id,
  itemCode: rawMaterial().code,
  locationId: location().id,
  grams: 1_250_500,
  pieces: null,
  ...fields,
});

export const cardLine = (
  fields: Partial<StockCardLine> = {},
): StockCardLine => ({
  entryId: 1,
  postedAt: '2026-10-14T05:30:00.000Z',
  movementType: 'RECEIPT',
  documentId: stockDocument().id,
  documentNumber: 'GRN-000001',
  locationId: location().id,
  grams: 1_000_000,
  pieces: null,
  balanceGrams: 1_000_000,
  balancePieces: null,
  ...fields,
});
