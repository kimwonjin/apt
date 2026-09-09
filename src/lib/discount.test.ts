// @ts-nocheck  실행: npx tsx src/lib/discount.test.ts
// 프레임워크 없음 — assert만. 기획서 7장 표와 1:1 대조.
import assert from 'node:assert';
import { discountPercent, nextTier, chargeAmount } from './discount';

// 기획서 7장 표
// | 참여 규모        | 5~9명 | 10~19명 | 20명+ |
// | 피크(11~12시)   | 5%    | 8%      | 12%   |
// | 오프피크(9~10시) | 10%   | 15%     | 20%   |
assert.equal(discountPercent(3, 'peak'), 0, '5명 미만 = 0%');
assert.equal(discountPercent(4, 'offpeak'), 0);
assert.equal(discountPercent(5, 'peak'), 5);
assert.equal(discountPercent(9, 'peak'), 5);
assert.equal(discountPercent(10, 'peak'), 8);
assert.equal(discountPercent(19, 'peak'), 8);
assert.equal(discountPercent(20, 'peak'), 12);
assert.equal(discountPercent(100, 'peak'), 12);
assert.equal(discountPercent(5, 'offpeak'), 10);
assert.equal(discountPercent(10, 'offpeak'), 15);
assert.equal(discountPercent(20, 'offpeak'), 20);

// nextTier
assert.deepEqual(nextTier(3, 'offpeak'), { needed: 2, percent: 10 });
assert.deepEqual(nextTier(9, 'peak'), { needed: 1, percent: 8 });
assert.equal(nextTier(20, 'peak'), null, '최고 구간이면 null');

// chargeAmount
assert.equal(chargeAmount(10000, 5, 'offpeak'), 9000);
assert.equal(chargeAmount(9900, 10, 'peak'), 9108); // 9900 * 0.92 = 9108
assert.equal(chargeAmount(8000, 2, 'peak'), 8000); // 할인 없음

console.log('discount.test.ts OK');
