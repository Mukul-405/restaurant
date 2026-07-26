-- One value per sidebar section.
CREATE TYPE "Permission" AS ENUM (
  'MANAGE_MEMBERS',
  'MANAGE_MENU',
  'VIEW_ANALYSIS',
  'PRINT_KOTS',
  'MANAGE_ROOMS',
  'MANAGE_RESERVATIONS',
  'VIEW_ROOM_STATUS',
  'MANAGE_ORDERS'
);

-- Empty by default: existing users reach no section until an admin ticks the boxes.
ALTER TABLE "User" ADD COLUMN "permissions" "Permission"[] DEFAULT ARRAY[]::"Permission"[];
