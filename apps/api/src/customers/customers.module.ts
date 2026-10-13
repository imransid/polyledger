import { Module } from '@nestjs/common';
import { CreateCustomerHandler } from './commands/create-customer.js';
import { UpdateCustomerHandler } from './commands/update-customer.js';
import { CustomersController } from './customers.controller.js';
import { GetCustomerHandler } from './queries/get-customer.js';
import { ListCustomersHandler } from './queries/list-customers.js';

@Module({
  controllers: [CustomersController],
  providers: [
    CreateCustomerHandler,
    UpdateCustomerHandler,
    ListCustomersHandler,
    GetCustomerHandler,
  ],
})
export class CustomersModule {}
