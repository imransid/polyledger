import { Module } from '@nestjs/common';
import { CreateMouldHandler } from './commands/create-mould.js';
import { UpdateMouldHandler } from './commands/update-mould.js';
import { MouldsController } from './moulds.controller.js';
import { GetMouldHandler } from './queries/get-mould.js';
import { ListMouldsHandler } from './queries/list-moulds.js';

@Module({
  controllers: [MouldsController],
  providers: [
    CreateMouldHandler,
    UpdateMouldHandler,
    ListMouldsHandler,
    GetMouldHandler,
  ],
})
export class MouldsModule {}
