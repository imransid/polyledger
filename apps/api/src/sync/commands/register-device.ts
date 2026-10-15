import { BadRequestException } from '@nestjs/common';
import {
  Command,
  CommandHandler,
  type ICommandHandler,
  QueryBus,
} from '@nestjs/cqrs';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { recordEvent } from '../../database/outbox.js';
import { PrismaService } from '../../database/prisma.service.js';
import { GetLocationQuery } from '../../stock/queries/get-location.js';
import {
  hashSecret,
  newPairingCode,
  PAIRING_CODE_LIFETIME_MS,
} from '../domain/pairing.js';
import { type DeviceView, toDeviceView } from '../infra/views.js';

export interface PairingCode {
  device: DeviceView;
  /** Shown once; only its hash is kept on the device. */
  pairingCode: string;
}

export class RegisterDeviceCommand extends Command<PairingCode> {
  constructor(
    readonly actorId: string,
    readonly device: { name: string; floorLocationId: string },
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

// A replay with the same key answers with the same code, so the stored
// answer holds it until the code expires half an hour later.
@CommandHandler(RegisterDeviceCommand)
export class RegisterDeviceHandler implements ICommandHandler<RegisterDeviceCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryBus: QueryBus,
  ) {}

  async execute({
    actorId,
    device,
    idempotencyKey,
  }: RegisterDeviceCommand): Promise<PairingCode> {
    const floor = await this.queryBus.execute(
      new GetLocationQuery(device.floorLocationId),
    );
    if (!floor?.isActive || floor.kind !== 'PRODUCTION_FLOOR') {
      throw new BadRequestException(
        'A tablet belongs to an active production floor',
      );
    }
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'RegisterDevice' },
        async () => {
          const pairingCode = newPairingCode();
          const created = await tx.device.create({
            data: {
              ...device,
              pairingCodeHash: hashSecret(pairingCode),
              pairingExpiresAt: new Date(Date.now() + PAIRING_CODE_LIFETIME_MS),
              createdById: actorId,
            },
          });
          await recordEvent(tx, 'device.registered', {
            deviceId: created.id,
            name: created.name,
            floorLocationId: created.floorLocationId,
          });
          return { device: toDeviceView(created), pairingCode };
        },
      ),
    );
  }
}
