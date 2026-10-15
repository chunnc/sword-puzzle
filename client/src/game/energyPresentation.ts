import type { EnergyState } from './domain';

export function energyMinutes(energy: EnergyState, serverNow: number) {
  if (energy.nextRecoveryAt === null) return '';
  const minutes = Math.max(1, Math.ceil((energy.nextRecoveryAt - serverNow) / 60_000));
  return `${String(minutes).padStart(2, '0')} phút`;
}
