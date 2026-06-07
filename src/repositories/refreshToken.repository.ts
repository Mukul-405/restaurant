import { prisma } from '../config/prisma';

export class RefreshTokenRepository {
  async create(token: string, userId: string, expiresAt: Date) {
    return prisma.refreshToken.create({
      data: {
        token,
        userId,
        expiresAt,
      },
    });
  }

  async findByToken(token: string) {
    return prisma.refreshToken.findUnique({
      where: { token },
      include: { user: true },
    });
  }

  async deleteByToken(token: string) {
    return prisma.refreshToken.delete({
      where: { token },
    });
  }

  async deleteAllForUser(userId: string) {
    return prisma.refreshToken.deleteMany({
      where: { userId },
    });
  }
}

export const refreshTokenRepository = new RefreshTokenRepository();
