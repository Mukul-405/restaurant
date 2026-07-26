// Run: npx ts-node src/scripts/check-kots.ts
// Asserts the /orders/kots filter actually excludes empty kotHistory and pages.
import assert from 'assert';
import { prisma } from '../config/prisma';
import { orderRepository } from '../repositories/order.repository';

async function main() {
  const { total, data } = await orderRepository.findKots({ page: 1, limit: 5 });

  const pendingTotal = await prisma.order.count({ where: { status: 'PENDING' } });
  assert(total <= pendingTotal, 'KOT total must not exceed PENDING orders');

  for (const o of data) {
    assert(Array.isArray(o.kotHistory) && o.kotHistory.length > 0, `order ${o.id} has empty kotHistory`);
  }

  const sorted = [...data].sort((a, b) => +a.createdAt - +b.createdAt);
  assert.deepStrictEqual(data.map(o => o.id), sorted.map(o => o.id), 'KOTs must be oldest-first');

  const page2 = await orderRepository.findKots({ page: 2, limit: 5 });
  const overlap = data.filter(o => page2.data.some(p => p.id === o.id));
  assert.strictEqual(overlap.length, 0, 'pages must not overlap');

  console.log(`ok — ${total} KOTs of ${pendingTotal} pending, page1=${data.length} page2=${page2.data.length}`);
}

main().finally(() => prisma.$disconnect());
