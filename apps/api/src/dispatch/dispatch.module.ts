import { Module } from '@nestjs/common';
import { PassGateHandler } from './commands/pass-gate.js';
import { PostChallanHandler } from './commands/post-challan.js';
import { RecordCustomerReturnHandler } from './commands/record-customer-return.js';
import { ReverseChallanHandler } from './commands/reverse-challan.js';
import { ReverseCustomerReturnHandler } from './commands/reverse-customer-return.js';
import { DispatchController } from './dispatch.controller.js';
import { ListChallansHandler } from './queries/list-challans.js';

@Module({
  controllers: [DispatchController],
  providers: [
    PostChallanHandler,
    PassGateHandler,
    ReverseChallanHandler,
    RecordCustomerReturnHandler,
    ReverseCustomerReturnHandler,
    ListChallansHandler,
  ],
})
export class DispatchModule {}
