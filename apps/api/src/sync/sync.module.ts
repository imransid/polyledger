import { Module } from '@nestjs/common';
import { IssuePairingCodeHandler } from './commands/issue-pairing-code.js';
import { PairDeviceHandler } from './commands/pair-device.js';
import { PushRecordsHandler } from './commands/push-records.js';
import { RegisterDeviceHandler } from './commands/register-device.js';
import { ReviewRecordHandler } from './commands/review-record.js';
import { RevokeDeviceHandler } from './commands/revoke-device.js';
import { StartSessionHandler } from './commands/start-session.js';
import { DeviceGuard } from './device.guard.js';
import { DevicesController } from './devices.controller.js';
import { ListDevicesHandler } from './queries/list-devices.js';
import { ListRejectionsHandler } from './queries/list-rejections.js';
import { PullChangesHandler } from './queries/pull-changes.js';
import { RejectionsController } from './rejections.controller.js';
import { SyncController } from './sync.controller.js';

@Module({
  controllers: [DevicesController, SyncController, RejectionsController],
  providers: [
    DeviceGuard,
    RegisterDeviceHandler,
    IssuePairingCodeHandler,
    RevokeDeviceHandler,
    PairDeviceHandler,
    StartSessionHandler,
    PushRecordsHandler,
    ReviewRecordHandler,
    ListDevicesHandler,
    PullChangesHandler,
    ListRejectionsHandler,
  ],
})
export class SyncModule {}
