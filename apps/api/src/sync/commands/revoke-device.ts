import { ConflictException, NotFoundException } from '@nestjs/common';
import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { recordEvent } from '../../database/outbox.js';
import { PrismaService } from '../../database/prisma.service.js';
import { type DeviceView, toDeviceView } from '../infra/views.js';

export class RevokeDeviceCommand extends Command<DeviceView> {
  constructor(
    readonly actorId: string,
    readonly deviceId: string,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

@CommandHandler(RevokeDeviceCommand)
export class RevokeDeviceHandler implements ICommandHandler<RevokeDeviceCommand> {
  constructor(private readonly prisma: PrismaService) {}

  execute({
    actorId,
    deviceId,
    idempotencyKey,
  }: RevokeDeviceCommand): Promise<DeviceView> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'RevokeDevice' },
        async () => {
          const device = await tx.device.findUnique({
            where: { id: deviceId },
          });
          if (!device) {
            throw new NotFoundException('Device not found');
          }
          if (device.revokedAt) {
            throw new ConflictException(`${device.name} is already revoked`);
          }
          const revoked = await tx.device.update({
            where: { id: deviceId },
            data: {
              revokedAt: new Date(),
              tokenHash: null,
              pairingCodeHash: null,
              pairingExpiresAt: null,
            },
          });
          await recordEvent(tx, 'device.revoked', {
            deviceId,
            name: device.name,
          });
          return toDeviceView(revoked);
        },
      ),
    );
  }
}
