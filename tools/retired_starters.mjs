// Field-level changes only: never regrade progress or recalculate a wallet.
export function retirementChanges(document) {
  const profile = document?.profileV2;
  const updates = {}, deletes = [];
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return { updates, deletes };
  for (const [key, retired] of [['ownedSwords', 'thanh-phong'], ['ownedSkills', 'nhat-kiem']]) {
    if (Array.isArray(profile[key]) && profile[key].includes(retired)) updates[`profileV2.${key}`] = profile[key].filter(id => id !== retired);
  }
  if (profile.loadout?.sword === 'thanh-phong') updates['profileV2.loadout.sword'] = null;
  if (Array.isArray(profile.loadout?.skills) && profile.loadout.skills.includes('nhat-kiem')) updates['profileV2.loadout.skills'] = profile.loadout.skills.filter(id => id !== 'nhat-kiem');
  if (Object.hasOwn(profile, 'startingLoadoutVersion')) deletes.push('profileV2.startingLoadoutVersion');
  return { updates, deletes };
}

export function hasRetirementChanges(changes) {
  return Object.keys(changes.updates).length > 0 || changes.deletes.length > 0;
}

// Re-read inside the transaction so concurrent purchases/equips are preserved.
export async function retirePlayer(db, ref, fieldValue, now = Date.now) {
  return db.runTransaction(async tx => {
    const current = await tx.get(ref);
    if (!current.exists) return false;
    const changes = retirementChanges(current.data());
    if (!hasRetirementChanges(changes)) return false;
    const patch = { ...changes.updates, 'profileV2.revision': fieldValue.increment(1), updatedAt: now() };
    for (const field of changes.deletes) patch[field] = fieldValue.delete();
    tx.update(ref, patch);
    return true;
  });
}
