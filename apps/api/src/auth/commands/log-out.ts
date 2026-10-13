import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { PrismaService } from '../../database/prisma.service.js';
import { hashRefreshToken } from '../domain/refresh-token.js';

export class LogOutCommand extends Command<void> {
  constructor(readonly refreshToken: string) {
    super();
  }
}

@CommandHandler(LogOutCommand)
export class LogOutHandler implements ICommandHandler<LogOutCommand> {
  constructor(private readonly prisma: PrismaService) {}

  // Ends the whole session, so logging out with a just-rotated token still works.
  async execute({ refreshToken }: LogOutCommand): Promise<void> {
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashRefreshToken(refreshToken) },
    });
    if (!token) {
      return;
    }
    await this.prisma.refreshToken.updateMany({
      where: { sessionId: token.sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
