import type { INestApplicationContext } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { CreateUserCommand } from '../auth/commands/create-user.js';
import { addDays, factoryToday } from '../common/dates.js';
import { CreateCustomerCommand } from '../customers/commands/create-customer.js';
import { PrismaService } from '../database/prisma.service.js';
import { ActivateFormulaVersionCommand } from '../formulas/commands/activate-formula-version.js';
import { CreateFormulaVersionCommand } from '../formulas/commands/create-formula-version.js';
import { CreateMachineCommand } from '../machines/commands/create-machine.js';
import { CreateRawMaterialCommand } from '../materials/commands/create-raw-material.js';
import { CreateMouldCommand } from '../moulds/commands/create-mould.js';
import { ConfirmSalesOrderCommand } from '../orders/commands/confirm-sales-order.js';
import { CreateSalesOrderCommand } from '../orders/commands/create-sales-order.js';
import { StartProductionCommand } from '../orders/commands/start-production.js';
import { CreateProductCommand } from '../products/commands/create-product.js';
import { CreateLocationCommand } from '../stock/commands/create-location.js';
import { PostOpeningCommand } from '../stock/commands/post-opening.js';
import { PostReceiptCommand } from '../stock/commands/post-receipt.js';
import { CreateSupplierCommand } from '../suppliers/commands/create-supplier.js';
import {
  CUSTOMERS,
  LOCATIONS,
  MACHINES,
  OPENING_STOCK,
  ORDERS,
  PRODUCTS,
  RAW_MATERIALS,
  RECEIPT,
  SUPPLIERS,
  USERS,
} from './demo-data.js';

type Ids = Map<string, string>;

// Fills an empty database through the same command handlers the API uses,
// so the demo data obeys every domain rule.
export async function seedDemo(
  app: INestApplicationContext,
  password: string,
): Promise<void> {
  const prisma = app.get(PrismaService);
  const [materialCount, staffCount] = await Promise.all([
    prisma.rawMaterial.count(),
    prisma.user.count({ where: { role: { not: 'OWNER' } } }),
  ]);
  if (materialCount + staffCount > 0) {
    throw new Error(
      'The database already has data; the demo seed only fills an empty one',
    );
  }
  const owner = await prisma.user.findFirst({
    where: { role: 'OWNER', isActive: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!owner) {
    throw new Error(
      'Create the owner first: set OWNER_NAME, OWNER_LOGIN and OWNER_PASSWORD in .env and start the API',
    );
  }

  const bus = app.get(CommandBus);
  const actorId = owner.id;
  for (const user of USERS) {
    await bus.execute(
      new CreateUserCommand(actorId, { ...user, password }, undefined),
    );
  }
  const locations = await byCode(
    LOCATIONS,
    async (location) =>
      (await prisma.location.findUnique({ where: { code: location.code } })) ??
      bus.execute(new CreateLocationCommand(actorId, location, undefined)),
  );
  const materials = await byCode(RAW_MATERIALS, (material) =>
    bus.execute(new CreateRawMaterialCommand(actorId, material, undefined)),
  );
  const products = await seedProducts(bus, actorId, materials);
  await byCode(MACHINES, (machine) =>
    bus.execute(new CreateMachineCommand(actorId, machine, undefined)),
  );
  const customers = await byCode(CUSTOMERS, (customer) =>
    bus.execute(new CreateCustomerCommand(actorId, customer, undefined)),
  );
  const suppliers = await byCode(SUPPLIERS, (supplier) =>
    bus.execute(new CreateSupplierCommand(actorId, supplier, undefined)),
  );
  await seedStock(bus, actorId, { locations, materials, products, suppliers });
  await seedOrders(bus, actorId, customers, products);
}

async function byCode<T extends { code: string }>(
  items: readonly T[],
  create: (item: T) => Promise<{ id: string }>,
): Promise<Ids> {
  const ids: Ids = new Map();
  for (const item of items) {
    ids.set(item.code, (await create(item)).id);
  }
  return ids;
}

async function seedProducts(
  bus: CommandBus,
  actorId: string,
  materials: Ids,
): Promise<Ids> {
  return byCode(PRODUCTS, async (product) => {
    const { mould, wasteBasisPoints, formula, ...details } = product;
    const created = await bus.execute(
      new CreateProductCommand(actorId, details, undefined),
    );
    await bus.execute(
      new CreateMouldCommand(
        actorId,
        { ...mould, name: `${product.name} mould`, productId: created.id },
        undefined,
      ),
    );
    const version = await bus.execute(
      new CreateFormulaVersionCommand(
        actorId,
        created.id,
        {
          wasteBasisPoints,
          lines: formula.map(([code, basisPoints]) => ({
            rawMaterialId: materials.get(code)!,
            basisPoints,
          })),
        },
        undefined,
      ),
    );
    await bus.execute(
      new ActivateFormulaVersionCommand(actorId, version.id, undefined),
    );
    return created;
  });
}

async function seedStock(
  bus: CommandBus,
  actorId: string,
  ids: { locations: Ids; materials: Ids; products: Ids; suppliers: Ids },
): Promise<void> {
  for (const [locationCode, lines] of Object.entries(OPENING_STOCK)) {
    await bus.execute(
      new PostOpeningCommand(
        actorId,
        {
          locationId: ids.locations.get(locationCode)!,
          lines: lines.map(([code, quantity]) =>
            ids.materials.has(code)
              ? {
                  itemType: 'RAW_MATERIAL',
                  itemId: ids.materials.get(code)!,
                  quantity,
                }
              : {
                  itemType: 'PRODUCT',
                  itemId: ids.products.get(code)!,
                  quantity,
                },
          ),
        },
        undefined,
      ),
    );
  }
  await bus.execute(
    new PostReceiptCommand(
      actorId,
      {
        supplierId: ids.suppliers.get(RECEIPT.supplier)!,
        supplierReference: RECEIPT.supplierReference,
        receivedOn: factoryToday(),
        locationId: ids.locations.get('RM-STORE')!,
        lines: RECEIPT.lines.map(([code, challanGrams, receivedGrams]) => ({
          rawMaterialId: ids.materials.get(code)!,
          challanGrams,
          receivedGrams,
        })),
      },
      undefined,
    ),
  );
}

async function seedOrders(
  bus: CommandBus,
  actorId: string,
  customers: Ids,
  products: Ids,
): Promise<void> {
  const today = factoryToday();
  for (const order of ORDERS) {
    const created = await bus.execute(
      new CreateSalesOrderCommand(
        actorId,
        {
          customerId: customers.get(order.customer)!,
          orderDate: addDays(today, -order.orderedDaysAgo),
          deliveryDate: addDays(today, order.dueInDays),
          customerPo: order.customerPo,
          notes: null,
          overDeliveryBasisPoints: 0,
          lines: order.lines.map(([code, pieces, unitPricePoisha]) => ({
            productId: products.get(code)!,
            pieces,
            unitPricePoisha,
          })),
        },
        undefined,
      ),
    );
    if (order.status === 'DRAFT') {
      continue;
    }
    await bus.execute(
      new ConfirmSalesOrderCommand(actorId, created.id, undefined),
    );
    if (order.status === 'IN_PRODUCTION') {
      await bus.execute(
        new StartProductionCommand(actorId, created.id, undefined),
      );
    }
  }
}
