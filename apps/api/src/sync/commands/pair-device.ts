import { UnauthorizedException } from '@nestjs/common';
import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { recordEvent } from '../../database/outbox.js';
import { PrismaService } from '../../database/prisma.service.js';
import {
  hashSecret,
  newDeviceToken,
  normalizePairingCode,
} from '../domain/pairing.js';
import type { PairedDevice } from '../device.guard.js';

export interface Pairing {
  /** Shown once to the tablet, which keeps it for every sync. */
  deviceToken: string;
  device: PairedDevice;
}

/** A tablet trading its one-time pairing code for its device token. */
export class PairDeviceCommand extends Command<Pairing> {
  constructor(readonly code: string) {
    super();
  }
}

// The code is spent in the same update that stores the token, so two
// tablets typing the same code can't both pair.
@CommandHandler(PairDeviceCommand)
export class PairDeviceHandler implements ICommandHandler<PairDeviceCommand> {
  constructor(private readonly prisma: PrismaService) {}

  execute({ code }: PairDeviceCommand): Promise<Pairing> {
    const deviceToken = newDeviceToken();
    const codeHash = hashSecret(normalizePairingCode(code));
    return this.prisma.$transaction(async (tx) => {
      const device = await tx.device.findUnique({
        where: { pairingCodeHash: codeHash },
      });
      const { count } = await tx.device.updateMany({
        where: {
          pairingCodeHash: codeHash,
          pairingExpiresAt: { gt: new Date() },
          revokedAt: null,
        },
        data: {
          tokenHash: hashSecret(deviceToken),
          pairingCodeHash: null,
          pairingExpiresAt: null,
          pairedAt: new Date(),
        },
      });
      if (count === 0 || !device) {
        throw new UnauthorizedException('Unknown or expired pairing code');
      }
      await recordEvent(tx, 'device.paired', { deviceId: device.id });
      return {
        deviceToken,
        device: {
          id: device.id,
          name: device.name,
          floorLocationId: device.floorLocationId,
        },
      };
    });
  }
}
