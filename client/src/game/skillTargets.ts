import type { SkillId } from './domain';
// Behavior and target selection are client code, deliberately absent from the catalog.
export function skillTarget(id: SkillId | null | undefined) {
  switch (id) {
    case 'nhat-kiem':
      return 'row';
    case 'ngu-kiem':
      return 'pair';
    case 'dan-loi':
      return 'triple';
    case 'lien-kiem':
      return 'chargedPair';
    case 'van-kiem':
      return 'kind';
    default:
      return 'cell';
  }
}
