import { getFirestore } from 'firebase-admin/firestore';
import { validateContent, mapFromDocument, mapResourceFromDocument, mapSummary, type GameContent } from './domain/game';
const published = new Map<number, GameContent>();
export async function loadContent(version: number): Promise<GameContent> {
  if (!Number.isSafeInteger(version) || version < 3) throw new Error('CONTENT_MISMATCH');
  const cached = published.get(version);
  if (cached) return cached;
  const snap = await getFirestore().collection('gameContent').doc(String(version)).get();
  if (!snap.exists) throw new Error('CONTENT_MISMATCH');
  const content = validateContent(snap.data());
  if (content.version !== version) throw new Error('CONTENT_MISMATCH');
  published.set(version, content);
  return content;
}
export async function currentContent() {
  const config = (await getFirestore().collection('gameConfig').doc('current').get()).data();
  if (!config?.contentVersion) throw new Error('CONTENT_NOT_CONFIGURED');
  return {
    config,
    content: await loadContent(config.contentVersion)
  };
}
export async function loadMap(version: number, levelId: number) {
  const content = await loadContent(version);
  const resource = await getFirestore().collection('gameMaps').doc(String(levelId)).get();
  if (!resource.exists) throw new Error('MAP_NOT_FOUND');
  const map = mapResourceFromDocument(resource.data(), content);
  if (map.id !== levelId) throw new Error('INVALID_MAP');
  return map;
}
export async function chapterMaps(version: number, chapterId: string) {
  const content = await loadContent(version);
  if (!content.chapters?.some(ch => ch.id === chapterId)) throw new Error('INVALID_CHAPTER');
  const result = await getFirestore().collection('gameMaps').where('contentVersion', '==', version)
    .where('chapterId', '==', chapterId).orderBy('orderInChapter').get();
  const chapter = content.chapters.find(ch => ch.id === chapterId)!;
  if (result.size === chapter.lastLevelId - chapter.firstLevelId + 1) return result.docs.map(doc => mapSummary(mapFromDocument(doc.data(), content)));
  return Promise.all(Array.from({ length: chapter.lastLevelId-chapter.firstLevelId+1 }, (_,i) => loadMap(version, chapter.firstLevelId+i).then(mapSummary)));
}
export async function latestChapterMaps(content: GameContent, chapterId: string) {
  const chapter = content.chapters?.find(ch => ch.id === chapterId);
  if (!chapter) throw new Error('INVALID_CHAPTER');
  const result = await getFirestore().collection('gameMaps').where('chapterId', '==', chapterId).orderBy('orderInChapter')
    .select('id', 'latestVersion', 'latestSummary').get();
  const resources = result.docs.filter(doc => /^[1-9]\d*$/.test(doc.id));
  if (resources.length === chapter.lastLevelId-chapter.firstLevelId+1) {
    return resources.map((doc,i) => {
      const data = doc.data(), summary = data.latestSummary;
      if (!summary || doc.id !== String(data.id) || data.id !== chapter.firstLevelId+i || summary.id !== data.id || summary.mapVersion !== data.latestVersion
        || summary.chapterId !== chapterId || summary.orderInChapter !== i+1) throw new Error('INVALID_MAP_RESOURCE');
      return summary;
    });
  }
  // Resolve the chapter from its numeric resources if the indexed summary set is incomplete.
  return chapterMaps(content.version, chapterId);
}
export async function loadMapVersion(levelId: number, mapVersion: number, configVersion: number) {
  const content = await loadContent(configVersion);
  const snap = await getFirestore().collection('gameMaps').doc(String(levelId)).get();
  const map = mapResourceFromDocument(snap.data(), content, mapVersion);
  if (map.id !== levelId) throw new Error('INVALID_MAP_RESOURCE');
  return map;
}
