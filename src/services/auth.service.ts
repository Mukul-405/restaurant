import { userRepository } from '../repositories/user.repository';
import { refreshTokenRepository } from '../repositories/refreshToken.repository';
import { hashPassword, comparePassword } from '../utils/hash.util';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt.util';
import { Role } from '@prisma/client';

export class AuthService {
  async login(phoneNumber: string, password: string) {
    const user = await userRepository.findByPhoneNumber(phoneNumber);
    if (!user || !user.isActive) {
      throw new Error('Invalid credentials');
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
      throw new Error('Invalid credentials');
    }

    if (!tokenRecord.user.isActive) {
      throw new Error('Invalid credentials');
    }

    if (new Date() > tokenRecord.expiresAt) {
      await refreshTokenRepository.deleteByToken(token);
      throw new Error('Invalid credentials');
    }

    // Atomic rotation: the delete IS the gate. Under two concurrent refreshes
    // with the same token only one deletes the row (count=1) and may rotate;
    // the loser (or any reuse of an already-rotated token) gets count=0, which
    // signals possible theft -> revoke the whole session family.
    const consumed = await refreshTokenRepository.deleteByToken(token);
    if (consumed.count === 0) {
      await refreshTokenRepository.deleteAllForUser(tokenRecord.user.id);
      throw new Error('Invalid credentials');
    }

    const payload = { id: tokenRecord.user.id, role: tokenRecord.user.role };
    const newAccessToken = generateAccessToken(payload);
    const newRefreshToken = generateRefreshToken(payload);

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
