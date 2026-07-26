import assert from 'assert';
import type { Request } from 'express';
import { userKey } from '../middlewares/rateLimit.middleware';

// Point of this middleware: two admins behind the same hotel WiFi IP must land
// in different buckets, else one admin's traffic locks out the rest.
const req = (ip: string, userId?: string) =>
  ({ ip, user: userId ? { id: userId, role: 'ADMIN' } : undefined }) as unknown as Request;

const HOTEL_IP = '203.0.113.7';

assert.notStrictEqual(
  userKey(req(HOTEL_IP, 'admin-a')),
  userKey(req(HOTEL_IP, 'admin-b')),
  'same-IP admins must not share a bucket',
);

assert.strictEqual(
  userKey(req('203.0.113.99', 'admin-a')),
  userKey(req(HOTEL_IP, 'admin-a')),
  'one admin must keep one bucket across IPs',
);

assert.strictEqual(userKey(req(HOTEL_IP)), userKey(req(HOTEL_IP)));
assert.notStrictEqual(userKey(req(HOTEL_IP)), userKey(req('203.0.113.99')));

console.log('✅ rate limit keys OK');
