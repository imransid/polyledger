import { ForbiddenException } from '@nestjs/common';
import {
  Command,
  CommandBus,
  CommandHandler,
  type ICommandHandler,
} from '@nestjs/cqrs';
import {
  CheckPinCommand,
  type PinUser,
} from '../../auth/commands/check-pin.js';
import { PrismaService } from '../../database/prisma.service.js';
import type { PairedDevice } from '../device.guard.js';
import { SESSION_LIFETIME_MS } from '../domain/sessions.js';
import { TABLET_RECORDERS } from '../roles.js';

export interface DeviceSessionView {
  /** The tablet puts it on every record made while signed in. */
  sessionId: string;
  user: PinUser;
  startedAt: Date;
  expiresAt: Date;
}

/** Someone signing in on a tablet with their login and PIN. */
export class StartSessionCommand extends Command<DeviceSessionView> {
  constructor(
    readonly device: PairedDevice,
    readonly login: string,
    readonly pin: string,
  ) {
    super();
  }
}

@CommandHandler(StartSessionCommand)
export class StartSessionHandler implements ICommandHandler<StartSessionCommand> {
  constructor(
    private readonly prisma: PrismaService,
    private readonly commandBus: CommandBus,
  ) {}

  async execute({
    device,
    login,
    pin,
  }: StartSessionCommand): Promise<DeviceSessionView> {
    const user = await this.commandBus.execute(
      new CheckPinCommand(device.id, login, pin),
    );
    if (!TABLET_RECORDERS.includes(user.role)) {
      throw new ForbiddenException(`A ${user.role} does not record on tablets`);
    }
    const startedAt = new Date();
    const session = await this.prisma.deviceSession.create({
      data: {
        deviceId: device.id,
        userId: user.id,
        startedAt,
        expiresAt: new Date(startedAt.getTime() + SESSION_LIFETIME_MS),
      },
    });
    return {
      sessionId: session.id,
      user,
      startedAt: session.startedAt,
      expiresAt: session.expiresAt,
    };
  }
}
