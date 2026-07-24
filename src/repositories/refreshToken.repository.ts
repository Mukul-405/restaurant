import { prisma } from '../config/prisma';
import crypto from 'crypto';

export class RefreshTokenRepository {
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async create(token: string, userId: string, expiresAt: Date) {
    return prisma.refreshToken.create({
      data: {
        token: this.hashToken(token),
        userId,
        expiresAt,
      },
    });
  }

  async findByToken(token: string) {
    return prisma.refreshToken.findUnique({
      where: { token: this.hashToken(token) },
      include: { user: true },
    });
  }

  async deleteByToken(token: string) {
    return prisma.refreshToken.delete({
      where: { token: this.hashToken(token) },
    });
  }

  async deleteAllForUser(userId: string) {
    return prisma.refreshToken.deleteMany({
      where: { userId },
    });
  }
}

export const refreshTokenRepository = new RefreshTokenRepository();
