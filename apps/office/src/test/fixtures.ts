import type {
  Balance,
  CardSummary,
  Challan,
  Company,
  CurrentUser,
  FormulaVersion,
  GrindingBatch,
  JobCard,
  Location,
  Machine,
  Mould,
  Page,
  Partner,
  Product,
  ProductionEntry,
  RawMaterial,
  Role,
  SalesOrder,
  ScrapSale,
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

export const salesOrder = (fields: Partial<SalesOrder> = {}): SalesOrder => ({
  id: '00000000-0000-4000-8000-000000000401',
  number: 'SO-000001',
  customerId: partner().id,
  orderDate: '2026-10-10',
  deliveryDate: '2026-10-30',
  customerPo: 'PDL/PO/118',
  notes: null,
  status: 'DRAFT',
  cancelReason: null,
  overDeliveryBasisPoints: 0,
  shortCloseReason: null,
  createdById: signedIn('MANAGER').id,
  lines: [
    {
      orderId: '00000000-0000-4000-8000-000000000401',
      lineNo: 1,
      productId: product().id,
      pieces: 200_000,
      unitPricePoisha: 85,
      deliveredPieces: 0,
      returnedPieces: 0,
    },
  ],
  late: false,
  ...stamps,
  ...fields,
});

export const jobCard = (fields: Partial<JobCard> = {}): JobCard => ({
  id: '00000000-0000-4000-8000-000000000501',
  number: 'JC-000001',
  productId: product().id,
  mouldId: mould().id,
  machineId: machine().id,
  floorLocationId: '00000000-0000-4000-8000-000000000102',
  salesOrderId: null,
  formulaVersionId: formulaVersion().id,
  pieceWeightMg: 2_500,
  cavities: 24,
  runnerWeightMg: 18_000,
  plannedPieces: 10_000,
  plannedStartDate: '2026-10-15',
  status: 'RUNNING',
  cancelReason: null,
  createdById: signedIn('MANAGER').id,
  ...stamps,
  ...fields,
});

export const summary = (fields: Partial<CardSummary> = {}): CardSummary => ({
  plannedPieces: 10_000,
  goodPieces: 1_000,
  rejectedPieces: 40,
  piecesOnFloor: 600,
  rejectBasisPoints: 385,
  materials: [
    {
      rawMaterialId: rawMaterial().id,
      code: 'RM-PP-01',
      name: 'PP homopolymer',
      issuedGrams: 20_000,
      usedForPiecesGrams: 2_548,
      usedForRunnersGrams: 510,
      usedForPurgeAndSweepingsGrams: 1_225,
      returnedGrams: 2_000,
      differenceGrams: 13_717,
    },
  ],
  waste: {
    expectedRejectAndRunnerGrams: 620,
    weighedRejectAndRunnerGrams: 600,
    differenceGrams: 20,
  },
  ...fields,
});

export const productionEntry = (
  fields: Partial<ProductionEntry> = {},
): ProductionEntry => ({
  id: '00000000-0000-4000-8000-000000000601',
  jobCardId: jobCard().id,
  shiftDate: '2026-10-15',
  shift: 'A',
  operatorId: '00000000-0000-4000-8000-000000000701',
  shotStart: 0,
  shotEnd: 260,
  goodPieces: 1_000,
  rejectedPieces: 40,
  stockDocumentId: '00000000-0000-4000-8000-000000000202',
  reversedAt: null,
  recordedById: '00000000-0000-4000-8000-000000000701',
  createdAt: stamps.createdAt,
  materials: [],
  warnings: [],
  ...fields,
});

export const challan = (fields: Partial<Challan> = {}): Challan => ({
  id: '00000000-0000-4000-8000-000000000801',
  number: 'DC-000012',
  stockDocumentId: '00000000-0000-4000-8000-000000000203',
  orderId: salesOrder().id,
  customerId: partner().id,
  fromLocationId: '00000000-0000-4000-8000-000000000103',
  vehicleNumber: 'DHAKA METRO-TA 11-2345',
  driverName: 'Abdul Karim',
  driverPhone: '+8801812345678',
  deliveryAddress: 'Plot 14, BSCIC I/A, Tongi, Gazipur',
  notes: null,
  dispatchedOn: '2026-10-15',
  gatePassStatus: 'PENDING',
  gatePassedAt: null,
  gatePassedById: null,
  reversedAt: null,
  recordedById: signedIn('STOREKEEPER').id,
  createdAt: stamps.createdAt,
  customerCode: partner().code,
  customerName: partner().name,
  orderNumber: salesOrder().number,
  customerPo: salesOrder().customerPo,
  lines: [
    {
      challanId: '00000000-0000-4000-8000-000000000801',
      productId: product().id,
      pieces: 24_040,
      returnedPieces: 0,
      code: product().code,
      name: product().name,
      piecesPerCarton: product().piecesPerCarton,
    },
  ],
  returns: [],
  ...fields,
});

export const company = (fields: Partial<Company> = {}): Company => ({
  name: 'Meghna Plastic Industries Ltd',
  address: 'Plot 22, Savar Industrial Area, Savar, Dhaka',
  phone: '+880 2 7745 0110',
  bin: null,
  ...fields,
});

export const grindingBatch = (
  fields: Partial<GrindingBatch> = {},
): GrindingBatch => ({
  id: '00000000-0000-4000-8000-000000000901',
  stockDocumentId: '00000000-0000-4000-8000-000000000204',
  scrapLocationId: '00000000-0000-4000-8000-000000000104',
  storeLocationId: location().id,
  inputItemType: 'RAW_MATERIAL',
  inputItemId: '00000000-0000-4000-8000-0000000000a9',
  inputPieces: null,
  inputGrams: 10_000,
  outputMaterialId: '00000000-0000-4000-8000-0000000000a9',
  outputGrams: 9_700,
  lossGrams: 300,
  groundOn: '2026-10-15',
  reversedAt: null,
  recordedById: signedIn('SUPERVISOR').id,
  createdAt: stamps.createdAt,
  ...fields,
});

export const scrapSale = (fields: Partial<ScrapSale> = {}): ScrapSale => ({
  id: '00000000-0000-4000-8000-000000000951',
  stockDocumentId: '00000000-0000-4000-8000-000000000205',
  buyerName: 'Karim Scrap Traders',
  soldOn: '2026-10-15',
  scrapLocationId: '00000000-0000-4000-8000-000000000104',
  reversedAt: null,
  recordedById: signedIn('MANAGER').id,
  createdAt: stamps.createdAt,
  lines: [
    {
      saleId: '00000000-0000-4000-8000-000000000951',
      lineNo: 1,
      itemType: 'RAW_MATERIAL',
      itemId: '00000000-0000-4000-8000-0000000000a9',
      pieces: null,
      grams: 2_345,
      pricePerKgPoisha: 4_550,
      amountPoisha: 10_670,
    },
  ],
  amountPoisha: 10_670,
  ...fields,
});
