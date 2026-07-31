import { userRepository } from '../repositories/user.repository';
import { refreshTokenRepository } from '../repositories/refreshToken.repository';
import { hashPassword } from '../utils/hash.util';
import { Permission, Role } from '@prisma/client';
import { AppError } from '../utils/AppError';
import { prisma } from '../config/prisma';

/**
 * SUPERADMIN is created by hand in the DB and is the account that can never be
 * locked out. Every mutation below routes through this guard rather than each
 * caller repeating the check.
 */
const assertNotSuperadmin = (user: { role: Role }, action: string) => {
  if (user.role === Role.SUPERADMIN) {
    throw new AppError(`Cannot ${action} the superadmin account`, 403);
  }
};

export class UserService {
  async createMember(data: {
    name: string;
    phoneNumber: string;
    password: string;
    role: Role;
    permissions?: Permission[];
  }) {
    // SUPERADMIN is provisioned manually in the DB, never through this API.
    if (data.role === Role.SUPERADMIN) {
      throw new AppError('Cannot create a superadmin account', 403);
    }

    const existingUser = await userRepository.findByPhoneNumber(data.phoneNumber);
    if (existingUser) {
      throw new Error('User with this phone number already exists');
    }

    const passwordHash = await hashPassword(data.password);
    let user;
    try {
      user = await userRepository.create({
        name: data.name,
        phoneNumber: data.phoneNumber,
        passwordHash,
        role: data.role,
        permissions: data.permissions ?? [],
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new Error('User with this phone number already exists');
      }
      throw error;
    }

    return {
      id: user.id,
      name: user.name,
      role: user.role,
      permissions: user.permissions,
      isActive: user.isActive,
    };
  }

  async updateMember(
    id: string,
    data: { name?: string; role?: Role; permissions?: Permission[] }
  ) {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new Error('User not found');
    }

    assertNotSuperadmin(user, 'edit');

    // Blocked both ways: nobody can be promoted into superadmin either.
    if (data.role === Role.SUPERADMIN) {
      throw new AppError('Cannot assign the superadmin role', 403);
    }

    const updatedUser = await userRepository.update(id, data);

    return {
      id: updatedUser.id,
      name: updatedUser.name,
      phoneNumber: updatedUser.phoneNumber,
      role: updatedUser.role,
      permissions: updatedUser.permissions,
      isActive: updatedUser.isActive,
    };
  }

  async blockMember(id: string) {
    return prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; role: Role; isActive: boolean }>>`
        SELECT id, role, "isActive" FROM "User"
        WHERE id = ${id} OR (role = 'ADMIN' AND "isActive" = true)
        ORDER BY id ASC
        FOR UPDATE`;

      const user = rows.find(r => r.id === id);
      if (!user) {
        throw new Error('User not found');
      }

      assertNotSuperadmin(user, 'block');

      // Prevent blocking the last admin
      if (user.role === Role.ADMIN) {
        const activeAdmins = rows.filter(r => r.role === Role.ADMIN && r.isActive).length;
        if (activeAdmins <= 1) {
          throw new Error('Cannot block the only admin account');
        }
      }

      const updatedUser = await tx.user.update({ where: { id }, data: { isActive: false } });
      // Same transaction as the block: a blocked user must never be left holding
      // usable refresh tokens because a second statement failed.
      await tx.refreshToken.deleteMany({ where: { userId: id } });
      return { id: updatedUser.id, isActive: updatedUser.isActive };
    });
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

    assertNotSuperadmin(user, 'delete');

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

  async resetPassword(id: string, newPassword: string, requesterId: string) {
    const user = await userRepository.findById(id);
    if (!user) {
      throw new Error('User not found');
    }

    // Superadmin can't be locked out by someone else, but must still be able
    // to change its own password.
    if (id !== requesterId) {
      assertNotSuperadmin(user, 'reset the password of');
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
      permissions: user.permissions,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    }));
  }
}

export const userService = new UserService();
