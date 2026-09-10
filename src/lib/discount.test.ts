// @ts-nocheck  실행: npx tsx src/lib/discount.test.ts
// 프레임워크 없음 — assert만. DEFAULT_DISCOUNT_TABLE(마감 시각 3단계)과 1:1 대조.
import assert from 'node:assert';
import { discountPercent, nextTier, chargeAmount } from './discount';

// DEFAULT_DISCOUNT_TABLE — 마감이 이를수록(before_10) 리드타임이 길어 할인율이 높다.
// | 참여 규모   | 5~9명 | 10~19명 | 20명+ |
// | 10시 이전   | 10%   | 15%     | 20%   |
// | 11시 이전   | 8%    | 12%     | 16%   |
// | 12시 이전   | 5%    | 8%      | 12%   |
assert.equal(discountPercent(3, 'before_12'), 0, '5명 미만 = 0%');
assert.equal(discountPercent(4, 'before_10'), 0);
assert.equal(discountPercent(5, 'before_12'), 5);
assert.equal(discountPercent(9, 'before_12'), 5);
assert.equal(discountPercent(10, 'before_12'), 8);
assert.equal(discountPercent(19, 'before_12'), 8);
assert.equal(discountPercent(20, 'before_12'), 12);
assert.equal(discountPercent(100, 'before_12'), 12);
assert.equal(discountPercent(5, 'before_11'), 8);
assert.equal(discountPercent(10, 'before_11'), 12);
assert.equal(discountPercent(20, 'before_11'), 16);
assert.equal(discountPercent(5, 'before_10'), 10);
assert.equal(discountPercent(10, 'before_10'), 15);
assert.equal(discountPercent(20, 'before_10'), 20);

// nextTier
assert.deepEqual(nextTier(3, 'before_10'), { needed: 2, percent: 10 });
assert.deepEqual(nextTier(9, 'before_12'), { needed: 1, percent: 8 });
assert.equal(nextTier(20, 'before_12'), null, '최고 구간이면 null');

// chargeAmount
assert.equal(chargeAmount(10000, 5, 'before_10'), 9000);
assert.equal(chargeAmount(9900, 10, 'before_12'), 9108); // 9900 * 0.92 = 9108
assert.equal(chargeAmount(8000, 2, 'before_12'), 8000); // 할인 없음

console.log('discount.test.ts OK');
