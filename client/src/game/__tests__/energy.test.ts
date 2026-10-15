import { advanceEnergy, consumeEnergy, ENERGY_RECOVERY_MS, fullEnergy } from '../domain';
import { energyMinutes } from '../energyPresentation';

it('recovers lives while the app is closed, caps energy, and preserves refill progress', () => {
  const start = 1_800_000_000_000;
  const first = consumeEnergy(fullEnergy(start), start);
  const second = consumeEnergy(first, start + 5 * 60_000);
  expect(second).toEqual({ current: 3, nextRecoveryAt: start + ENERGY_RECOVERY_MS, asOf: start + 5 * 60_000 });
  expect(advanceEnergy(second, start + ENERGY_RECOVERY_MS)).toEqual({
    current: 4, nextRecoveryAt: start + ENERGY_RECOVERY_MS * 2, asOf: start + ENERGY_RECOVERY_MS,
  });
  expect(advanceEnergy(second, start + ENERGY_RECOVERY_MS * 8)).toEqual({ current: 5, nextRecoveryAt: null, asOf: start + ENERGY_RECOVERY_MS * 8 });
});

it('formats refill as rounded-up minutes without seconds', () => {
  const energy = { current: 2, nextRecoveryAt: 1_800_000_000_000 + 29 * 60_000 + 10_000, asOf: 1_800_000_000_000 };
  expect(energyMinutes(energy, energy.asOf)).toBe('30 phút');
  expect(energyMinutes(energy, energy.nextRecoveryAt - 30_000)).toBe('01 phút');
});
