import { ConflictException, NotFoundException } from '@nestjs/common';
import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { withIdempotencyKey } from '../../database/idempotency.js';
import { recordEvent } from '../../database/outbox.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  hashSecret,
  newPairingCode,
  PAIRING_CODE_LIFETIME_MS,
} from '../domain/pairing.js';
import { toDeviceView } from '../infra/views.js';
import type { PairingCode } from './register-device.js';

export class IssuePairingCodeCommand extends Command<PairingCode> {
  constructor(
    readonly actorId: string,
    readonly deviceId: string,
    readonly idempotencyKey: string | undefined,
  ) {
    super();
  }
}

// For a tablet that was reset or lost its token. Its old token stops
// working at once, so a stolen one is useless too.
@CommandHandler(IssuePairingCodeCommand)
export class IssuePairingCodeHandler implements ICommandHandler<IssuePairingCodeCommand> {
  constructor(private readonly prisma: PrismaService) {}

  execute({
    actorId,
    deviceId,
    idempotencyKey,
  }: IssuePairingCodeCommand): Promise<PairingCode> {
    return this.prisma.$transaction((tx) =>
      withIdempotencyKey(
        tx,
        { actorId, key: idempotencyKey, command: 'IssuePairingCode' },
        async () => {
          const device = await tx.device.findUnique({
            where: { id: deviceId },
          });
          if (!device) {
            throw new NotFoundException('Device not found');
          }
          if (device.revokedAt) {
            throw new ConflictException(
              `${device.name} is revoked; register the tablet again`,
            );
          }
          const pairingCode = newPairingCode();
          const updated = await tx.device.update({
            where: { id: deviceId },
            data: {
              tokenHash: null,
              pairingCodeHash: hashSecret(pairingCode),
              pairingExpiresAt: new Date(Date.now() + PAIRING_CODE_LIFETIME_MS),
            },
          });
          await recordEvent(tx, 'device.pairing_code_issued', { deviceId });
          return { device: toDeviceView(updated), pairingCode };
        },
      ),
    );
  }
}
