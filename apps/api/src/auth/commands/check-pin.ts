import {
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import type { Role } from '../../generated/prisma/client.js';
import { normalizeLogin } from '../domain/login.js';
import { verifyPassword } from '../domain/password.js';
import { PIN_ATTEMPTS, PIN_LOCK_MS, PIN_ROLES } from '../domain/pin.js';

export interface PinUser {
  id: string;
  name: string;
  role: Role;
}

/** Signing in on a tablet: the user behind a login and PIN, on one device. */
export class CheckPinCommand extends Command<PinUser> {
  constructor(
    readonly deviceId: string,
    readonly login: string,
    readonly pin: string,
  ) {
    super();
  }
}

// Wrong PINs are counted per user and tablet and saved before refusing, so
// a lock-out holds even though the request fails.
@CommandHandler(CheckPinCommand)
export class CheckPinHandler implements ICommandHandler<CheckPinCommand> {
  constructor(private readonly prisma: PrismaService) {}

  async execute({ deviceId, login, pin }: CheckPinCommand): Promise<PinUser> {
    const user = await this.findUser(login);
    if (!user) {
      // As slow as a real check, so the answer doesn't reveal who exists.
      await verifyPassword(undefined, pin);
      throw wrongPin();
    }
    const key = { deviceId_userId: { deviceId, userId: user.id } };
    const attempt = await this.prisma.pinAttempt.findUnique({ where: key });
    if (attempt?.lockedUntil && attempt.lockedUntil > new Date()) {
      throw locked(attempt.lockedUntil);
    }
    if (!(await verifyPassword(user.pinHash ?? undefined, pin))) {
      await this.countFailure(key);
      throw wrongPin();
    }
    await this.prisma.pinAttempt.deleteMany({ where: key.deviceId_userId });
    return { id: user.id, name: user.name, role: user.role };
  }

  private async findUser(login: string) {
    const normalized = normalizeLogin(login);
    if (!normalized) {
      return null;
    }
    return this.prisma.user.findFirst({
      where: {
        OR: [{ email: normalized }, { phone: normalized }],
        isActive: true,
        role: { in: PIN_ROLES },
        pinHash: { not: null },
      },
    });
  }

  private async countFailure(key: {
    deviceId_userId: { deviceId: string; userId: string };
  }) {
    const { failures } = await this.prisma.pinAttempt.upsert({
      where: key,
      create: { ...key.deviceId_userId, failures: 1 },
      update: { failures: { increment: 1 } },
    });
    if (failures < PIN_ATTEMPTS) {
      return;
    }
    const lockedUntil = new Date(Date.now() + PIN_LOCK_MS);
    await this.prisma.pinAttempt.update({
      where: key,
      data: { failures: 0, lockedUntil },
    });
    throw locked(lockedUntil);
  }
}

function wrongPin() {
  return new UnauthorizedException('Wrong login or PIN');
}

function locked(until: Date) {
  const minutes = Math.ceil((until.getTime() - Date.now()) / 60_000);
  return new HttpException(
    `Too many wrong PINs on this tablet; try again in ${minutes} min`,
    HttpStatus.LOCKED,
  );
}
