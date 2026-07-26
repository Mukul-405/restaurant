import assert from 'assert';
import { Permission, Role } from '@prisma/client';
import { hasPermission } from '../middlewares/auth.middleware';

const user = (role: Role, permissions: Permission[] = []) => ({ role, permissions });

// SUPERADMIN passes everything without a single box ticked.
const superadmin = user(Role.SUPERADMIN);
for (const p of Object.values(Permission)) {
  assert.strictEqual(hasPermission(superadmin, p), true, `superadmin must pass ${p}`);
}

// ADMIN gets no bypass — an empty list means no access.
const bareAdmin = user(Role.ADMIN);
assert.strictEqual(hasPermission(bareAdmin, Permission.MANAGE_MEMBERS), false, 'admin must not bypass');

// ...and only what was explicitly granted.
const partialAdmin = user(Role.ADMIN, [Permission.MANAGE_MEMBERS]);
assert.strictEqual(hasPermission(partialAdmin, Permission.MANAGE_MEMBERS), true);
assert.strictEqual(hasPermission(partialAdmin, Permission.PRINT_KOTS), false);

// Same rule for any other role.
const waiter = user(Role.WAITER, [Permission.MANAGE_ORDERS]);
assert.strictEqual(hasPermission(waiter, Permission.MANAGE_ORDERS), true);
assert.strictEqual(hasPermission(waiter, Permission.VIEW_ANALYSIS), false);

assert.strictEqual(hasPermission(undefined, Permission.MANAGE_ORDERS), false);

console.log('✅ permission rules OK');
