import { userRepository } from '../repositories/user.repository';
import { refreshTokenRepository } from '../repositories/refreshToken.repository';
import { hashPassword, comparePassword } from '../utils/hash.util';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt.util';
import { Role } from '@prisma/client';

export class AuthService {
  async login(phoneNumber: string, password: string) {
    const user = await userRepository.findByPhoneNumber(phoneNumber);
    if (!user || !user.isActive) {
      throw new Error('Invalid credentials or account is inactive');
    }

    const isValidPassword = await comparePassword(password, user.passwordHash);
    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }

    const payload = { id: user.id, role: user.role };
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    // Save refresh token in DB (expires in 1 day)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 1);
    await refreshTokenRepository.create(refreshToken, user.id, expiresAt);

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, name: user.name, role: user.role },
    };
  }

  async refreshToken(token: string) {
    const decoded = verifyRefreshToken(token);
    
    const tokenRecord = await refreshTokenRepository.findByToken(token);
    if (!tokenRecord) {
      throw new Error('Refresh token not found or already revoked');
    }

    if (!tokenRecord.user.isActive) {
      throw new Error('Invalid credentials or account is inactive');
    }

    if (new Date() > tokenRecord.expiresAt) {
      await refreshTokenRepository.deleteByToken(token);
      throw new Error('Refresh token expired');
    }

    const payload = { id: tokenRecord.user.id, role: tokenRecord.user.role };
    const newAccessToken = generateAccessToken(payload);
    const newRefreshToken = generateRefreshToken(payload);

    // Revoke old and create new
    await refreshTokenRepository.deleteByToken(token);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 1);
    await refreshTokenRepository.create(newRefreshToken, tokenRecord.user.id, expiresAt);

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  async logout(refreshToken: string) {
    await refreshTokenRepository.deleteByToken(refreshToken);
  }
}

export const authService = new AuthService();
