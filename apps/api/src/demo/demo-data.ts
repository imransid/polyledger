import type {
  LocationKind,
  RawMaterialType,
  Role,
} from '../generated/prisma/client.js';

// A small injection moulding plant near Dhaka. Codes are what the factory
// would write on sacks and job cards; companies and people are made up.

export const USERS: { name: string; email: string; role: Role }[] = [
  { name: 'Nasrin Akter', email: 'manager@demo.test', role: 'MANAGER' },
  {
    name: 'Rafiqul Islam',
    email: 'storekeeper@demo.test',
    role: 'STOREKEEPER',
  },
  { name: 'Kamal Hossain', email: 'supervisor@demo.test', role: 'SUPERVISOR' },
  { name: 'Shahin Alam', email: 'operator@demo.test', role: 'OPERATOR' },
  { name: 'Abdul Karim', email: 'guard@demo.test', role: 'GUARD' },
];

export const COMPANY = {
  name: 'Meghna Plastic Industries Ltd',
  address: 'Plot 22, Savar Industrial Area, Savar, Dhaka',
  phone: '+880 2 7745 0110',
  bin: '0012345678901',
};

// The stock migration already creates these four; the seed reuses them.
export const LOCATIONS: { code: string; name: string; kind: LocationKind }[] = [
  {
    code: 'RM-STORE',
    name: 'Main raw material store',
    kind: 'RAW_MATERIAL_STORE',
  },
  { code: 'FLOOR', name: 'Production floor', kind: 'PRODUCTION_FLOOR' },
  {
    code: 'FG-STORE',
    name: 'Finished goods store',
    kind: 'FINISHED_GOODS_STORE',
  },
  { code: 'SCRAP', name: 'Scrap yard', kind: 'SCRAP_YARD' },
];

export const RAW_MATERIALS: {
  code: string;
  name: string;
  type: RawMaterialType;
  minimumStockGrams: number;
}[] = [
  {
    code: 'RM-PP-H030',
    name: 'PP homopolymer H030SG',
    type: 'RESIN',
    minimumStockGrams: 500_000,
  },
  {
    code: 'RM-HDPE-INJ',
    name: 'HDPE injection grade',
    type: 'RESIN',
    minimumStockGrams: 300_000,
  },
  {
    code: 'MB-WHT-01',
    name: 'White masterbatch',
    type: 'MASTERBATCH',
    minimumStockGrams: 25_000,
  },
  {
    code: 'MB-BLU-01',
    name: 'Blue masterbatch',
    type: 'MASTERBATCH',
    minimumStockGrams: 10_000,
  },
  {
    code: 'MB-RED-01',
    name: 'Red masterbatch',
    type: 'MASTERBATCH',
    minimumStockGrams: 10_000,
  },
  {
    code: 'AD-UV-01',
    name: 'UV stabiliser',
    type: 'ADDITIVE',
    minimumStockGrams: 5_000,
  },
  {
    code: 'RG-PP-01',
    name: 'PP regrind',
    type: 'REGRIND',
    minimumStockGrams: 0,
  },
];

/** Each product with its mould and its formula as [material code, basis points]. */
export const PRODUCTS = [
  {
    code: 'CAP-28-WHT',
    name: '28 mm bottle cap, white',
    pieceWeightMg: 2_500,
    colour: 'White',
    piecesPerCarton: 2_000,
    mould: {
      code: 'M-CAP28-24',
      cavities: 24,
      cycleTimeTenths: 85,
      runnerWeightMg: 18_000,
    },
    wasteBasisPoints: 300,
    formula: [
      ['RM-PP-H030', 9_800],
      ['MB-WHT-01', 200],
    ],
  },
  {
    code: 'CAP-38-BLU',
    name: '38 mm jar cap, blue',
    pieceWeightMg: 4_200,
    colour: 'Blue',
    piecesPerCarton: 1_000,
    mould: {
      code: 'M-CAP38-16',
      cavities: 16,
      cycleTimeTenths: 95,
      runnerWeightMg: 20_000,
    },
    wasteBasisPoints: 300,
    formula: [
      ['RM-PP-H030', 9_750],
      ['MB-BLU-01', 250],
    ],
  },
  {
    code: 'BKT-20L-RED',
    name: '20 L paint bucket, red',
    pieceWeightMg: 850_000,
    colour: 'Red',
    piecesPerCarton: 10,
    mould: {
      code: 'M-BKT20-01',
      cavities: 1,
      cycleTimeTenths: 480,
      runnerWeightMg: 12_000,
    },
    wasteBasisPoints: 200,
    formula: [
      ['RM-HDPE-INJ', 9_650],
      ['MB-RED-01', 300],
      ['AD-UV-01', 50],
    ],
  },
  {
    code: 'CHR-01-WHT',
    name: 'Garden chair, white',
    pieceWeightMg: 2_300_000,
    colour: 'White',
    piecesPerCarton: 4,
    mould: {
      code: 'M-CHR01-01',
      cavities: 1,
      cycleTimeTenths: 650,
      runnerWeightMg: 0,
    },
    wasteBasisPoints: 250,
    formula: [
      ['RM-PP-H030', 9_500],
      ['MB-WHT-01', 400],
      ['AD-UV-01', 100],
    ],
  },
] as const;

export const MACHINES = [
  { code: 'IM-01', name: 'Haitian MA1600', tonnage: 160 },
  { code: 'IM-02', name: 'Haitian MA2500', tonnage: 250 },
  { code: 'IM-03', name: 'Chen Hsong JM450', tonnage: 450 },
  { code: 'IM-04', name: 'Haitian MA6500', tonnage: 650 },
];

export const CUSTOMERS = [
  {
    code: 'CUS-PADMA',
    name: 'Padma Drinks Ltd',
    phone: '+8801711000101',
    address: 'Plot 14, BSCIC I/A, Tongi, Gazipur',
  },
  {
    code: 'CUS-SHAPLA',
    name: 'Shapla Foods',
    phone: '+8801811000202',
    address: 'House 9, Road 4, Sector 7, Uttara, Dhaka',
  },
  {
    code: 'CUS-KARNA',
    name: 'Karnaphuli Paints',
    phone: '+8801911000303',
    address: 'Kalurghat I/A, Chattogram',
  },
  {
    code: 'CUS-RUPSHA',
    name: 'Rupsha Home Store',
    phone: '+8801611000404',
    address: 'KDA Avenue, Khulna',
  },
];

export const SUPPLIERS = [
  {
    code: 'SUP-BENGAL',
    name: 'Bengal Polymer Traders',
    phone: '+8801712000505',
    address: 'Moulvibazar, Old Dhaka',
  },
  {
    code: 'SUP-CTG',
    name: 'Chattogram Resin House',
    phone: '+8801812000606',
    address: 'Agrabad C/A, Chattogram',
  },
  {
    code: 'SUP-COLOUR',
    name: 'Colour Tech Masterbatch',
    phone: '+8801912000707',
    address: 'Tejgaon I/A, Dhaka',
  },
];

/** Counted stock on the day the demo starts, by location code. */
export const OPENING_STOCK: Record<string, [string, number][]> = {
  'RM-STORE': [
    ['RM-PP-H030', 3_500_000],
    ['RM-HDPE-INJ', 1_200_000],
    ['MB-WHT-01', 80_000],
    ['MB-BLU-01', 40_000],
    ['MB-RED-01', 35_000],
    ['AD-UV-01', 12_000],
  ],
  'FG-STORE': [
    ['CAP-28-WHT', 60_000],
    ['BKT-20L-RED', 120],
  ],
  SCRAP: [['RG-PP-01', 45_000]],
};

/** Pieces and price per piece in poisha; days are counted from today. */
export const ORDERS: {
  customer: string;
  orderedDaysAgo: number;
  dueInDays: number;
  customerPo: string | null;
  lines: [string, number, number][];
  status: 'DRAFT' | 'CONFIRMED' | 'IN_PRODUCTION';
}[] = [
  {
    customer: 'CUS-PADMA',
    orderedDaysAgo: 6,
    dueInDays: 14,
    customerPo: 'PDL/PO/2026/118',
    lines: [['CAP-28-WHT', 200_000, 85]],
    status: 'CONFIRMED',
  },
  {
    customer: 'CUS-SHAPLA',
    orderedDaysAgo: 1,
    dueInDays: 25,
    customerPo: null,
    lines: [['CAP-38-BLU', 50_000, 140]],
    status: 'DRAFT',
  },
  {
    customer: 'CUS-KARNA',
    orderedDaysAgo: 12,
    dueInDays: 3,
    customerPo: 'KP-7731',
    lines: [['BKT-20L-RED', 3_000, 9_500]],
    status: 'IN_PRODUCTION',
  },
  {
    customer: 'CUS-RUPSHA',
    orderedDaysAgo: 3,
    dueInDays: 30,
    customerPo: 'RHS-0412',
    lines: [
      ['CHR-01-WHT', 400, 65_000],
      ['BKT-20L-RED', 200, 9_800],
    ],
    status: 'CONFIRMED',
  },
];

/** A goods received note with a short delivery, for the shortages report. */
export const RECEIPT = {
  supplier: 'SUP-BENGAL',
  supplierReference: 'BPT-CH-5521',
  lines: [['RM-PP-H030', 2_000_000, 1_998_500]] as [string, number, number][],
};
