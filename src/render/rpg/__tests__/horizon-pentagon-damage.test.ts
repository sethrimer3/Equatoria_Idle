import { describe, expect, it, vi } from 'vitest';
import { createDamageFns } from '../rpg-damage';
import { makeHorizonPentagonGroup } from '../horizon-pentagon-factories';

describe('Horizon pentagon damage', () => {
  it('takes damage during swap cooldown without triggering another swap', () => {
    const recordDps = vi.fn();
    const { damageHorizonPentagonReal } = createDamageFns({ recordDps });
    const group = makeHorizonPentagonGroup(100, 200, 1, 0, 640);
    group.swapCdMs = 500;
    const initialHp = group.hp;
    const initialX = group.x;
    const initialY = group.y;

    const damage = damageHorizonPentagonReal(group, group.def + 25, 0);

    expect(damage).toBe(25);
    expect(group.hp).toBe(initialHp - 25);
    expect(group.x).toBe(initialX);
    expect(group.y).toBe(initialY);
    expect(recordDps).toHaveBeenCalledWith(25, '#6699ff');
  });
});
