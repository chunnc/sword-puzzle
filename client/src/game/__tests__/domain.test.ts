import { CONTENT, SKILLS, SWORDS, REALMS, applyOperation, emptyProfile, expForStars, gradeStars, highestUnlocked, mergeLevels, realmForExp, skillCost, totalExp, type PlayerProfile } from '../domain';
import { getLevel } from '../levels';
function progress(count: number, stars: 0 | 1 | 2 | 3 = 3): PlayerProfile { const p = emptyProfile(); p.levels = Array.from({ length: count }, (_, i) => ({ levelId: i + 1, stars })); p.totalExp = totalExp(p.levels); p.coins = 10000; return p; }
describe('content and cultivation', () => {
    it('has the complete published catalog and legal level goals', () => { expect([CONTENT.tiles.length, SKILLS.length, SWORDS.length, REALMS.length]).toEqual([4, 8, 8, 10]); for (let id = 1; id <= 40; id++) {
        const l = getLevel(id);
        expect(l.baseExp).toBe(100);
        expect(l.obstacles.rocks + l.obstacles.seals).toBeLessThan(49);
        expect(l.moves).toBeGreaterThan(0);
    } expect(REALMS[9].name).toBe('Chân Tiên'); });
    it.each([[0, 30], [1, 60], [2, 80], [3, 100]] as const)('awards %i stars = %i EXP', (stars, exp) => expect(expForStars(stars)).toBe(exp));
    it('zero-star completion unlocks the next stage and upgrades only the EXP difference', () => { let p = emptyProfile(); const rewards = []; for (const stars of [0, 1, 2, 3, 3, 0] as const) {
        const old = p.totalExp;
        const result = applyOperation(p, { id: `win_id_${stars}`, kind: 'win', levelId: 1, stars, objectiveProgress: { main: getLevel(1).objectives[0].target } });
        p = result.profile;
        rewards.push(p.totalExp - old);
    } expect(rewards).toEqual([30, 30, 20, 20, 0, 0]); expect(highestUnlocked(p.levels)).toBe(2); expect(p.coins).toBe(200); });
    it('merges best stars without adding duplicate EXP', () => expect(totalExp(mergeLevels([{ levelId: 1, stars: 2 }], [{ levelId: 1, stars: 3 }]))).toBe(100));
    it.each([[0, 1200], [1, 2400], [2, 3200], [3, 4000]] as const)('40 stages at %i stars yield %i EXP', (stars, exp) => expect(totalExp(progress(40, stars).levels)).toBe(exp));
    it('calculates exact realm boundaries and sub-stages', () => { for (let i = 1; i < REALMS.length; i++) {
        expect(realmForExp(REALMS[i].exp - 1).index).toBe(i - 1);
        expect(realmForExp(REALMS[i].exp).index).toBe(i);
    } expect(realmForExp(1499).skillSlots).toBe(1); expect(realmForExp(1500).skillSlots).toBe(2); expect(realmForExp(375).stage).toBe(1); expect(realmForExp(750).stage).toBe(2); expect(realmForExp(1125).stage).toBe(3); });
    it('grades successful last-turn wins as zero stars', () => expect([gradeStars(6, 24), gradeStars(3, 24), gradeStars(1, 24), gradeStars(0, 24)]).toEqual([3, 2, 1, 0]));
    it('checks shop ownership, unlocks, funds and slot limits', () => { let p = emptyProfile(); expect(applyOperation(p, { id: 'purchase', kind: 'purchase', category: 'skill', itemId: 'ngu-kiem' }).error).toBe('ITEM_LOCKED'); p = progress(3); p = applyOperation(p, { id: 'purchase', kind: 'purchase', category: 'skill', itemId: 'ngu-kiem' }).profile; expect(p.coins).toBe(9850); expect(applyOperation(p, { id: 'duplicate', kind: 'purchase', category: 'skill', itemId: 'ngu-kiem' }).error).toBe('ALREADY_OWNED'); expect(applyOperation(p, { id: 'equip_slot', kind: 'equip', loadout: { sword: 'thanh-phong', skills: ['nhat-kiem', 'ngu-kiem'] } }).error).toBe('INVALID_LOADOUT'); p = progress(15); p.ownedSkills.push('ngu-kiem'); expect(applyOperation(p, { id: 'equip_slot', kind: 'equip', loadout: { sword: 'thanh-phong', skills: ['nhat-kiem', 'ngu-kiem'] } }).error).toBeUndefined(); });
    it('combines cost reductions multiplicatively', () => { expect(skillCost('nhat-kiem', 'huyen-co', true)).toBe(41); expect(skillCost('ngu-kiem', 'huyen-co', true)).toBe(21); });
});
