import { Module } from '@nestjs/common';
import { CreateSupplierHandler } from './commands/create-supplier.js';
import { UpdateSupplierHandler } from './commands/update-supplier.js';
import { SuppliersController } from './suppliers.controller.js';
import { GetSupplierHandler } from './queries/get-supplier.js';
import { ListSuppliersHandler } from './queries/list-suppliers.js';

@Module({
  controllers: [SuppliersController],
  providers: [
    CreateSupplierHandler,
    UpdateSupplierHandler,
    ListSuppliersHandler,
    GetSupplierHandler,
  ],
})
export class SuppliersModule {}
