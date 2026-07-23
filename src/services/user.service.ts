import { userRepository } from '../repositories/user.repository';
import { refreshTokenRepository } from '../repositories/refreshToken.repository';
import { hashPassword } from '../utils/hash.util';
import { Role } from '@prisma/client';

export class UserService {
  async createMember(data: { name: string; phoneNumber: string; password: string; role: Role }) {


    const existingUser = await userRepository.findByPhoneNumber(data.phoneNumber);
    if (existingUser) {
      throw new Error('User with this phone number already exists');
    }

    const passwordHash = await hashPassword(data.password);

    const user = await userRepository.create({
      name: data.name,
      phoneNumber: data.phoneNumber,
      passwordHash,
      role: data.role,
    });

    return { id: user.id, name: user.name, role: user.role, isActive: user.isActive };
  }

  async blockMember(id: string) {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new Error('User not found');
    }

    // Prevent blocking the last admin
    if (user.role === Role.ADMIN) {
      const activeAdmins = await userRepository.countAdmins();
      if (activeAdmins <= 1) {
        throw new Error('Cannot block the only admin account');
      }
    }

    const updatedUser = await userRepository.updateStatus(id, false);
    // Immediately delete all refresh tokens to log them out globally
    await refreshTokenRepository.deleteAllForUser(id);
    return { id: updatedUser.id, isActive: updatedUser.isActive };
  }

  async unblockMember(id: string) {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new Error('User not found');
    }

    const updatedUser = await userRepository.updateStatus(id, true);
    return { id: updatedUser.id, isActive: updatedUser.isActive };
  }

  async deleteMember(id: string) {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new Error('User not found');
    }

    try {
      await userRepository.delete(id);
      return { message: 'User deleted successfully' };
    } catch (error: any) {
      if (error.code === 'P2003' || (error.message && error.message.includes('constraint'))) {
        throw new Error('Cannot delete this member because they have associated orders. Please block them instead.');
      }
      throw error;
    }
  }

  async resetPassword(id: string, newPassword: string) {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new Error('User not found');
    }

    const passwordHash = await hashPassword(newPassword);
    await userRepository.updatePassword(id, passwordHash);

    // Log out the user from all devices after password reset for security
    await refreshTokenRepository.deleteAllForUser(id);

    return { message: 'Password reset successfully' };
  }

  async getAllMembers() {
    const users = await userRepository.findAll();
    return users.map(user => ({
      id: user.id,
      name: user.name,
      phoneNumber: user.phoneNumber,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }));
  }
}

export const userService = new UserService();
