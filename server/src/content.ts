import { getFirestore } from 'firebase-admin/firestore';
import { validateContent, mapFromDocument, mapSummary, type GameContent } from './domain/game';
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
  const snap = await getFirestore().collection('gameMaps').doc(`${version}_${levelId}`).get();
  if (!snap.exists) throw new Error('MAP_NOT_FOUND');
  const map = mapFromDocument(snap.data(), content);
  if (map.id !== levelId) throw new Error('INVALID_MAP');
  return map;
}
export async function chapterMaps(version: number, chapterId: string) {
  const content = await loadContent(version);
  if (!content.chapters?.some(ch => ch.id === chapterId)) throw new Error('INVALID_CHAPTER');
  const result = await getFirestore().collection('gameMaps').where('contentVersion', '==', version)
    .where('chapterId', '==', chapterId).orderBy('orderInChapter').get();
  const chapter = content.chapters.find(ch => ch.id === chapterId)!;
  if (result.size !== chapter.lastLevelId - chapter.firstLevelId + 1) throw new Error('CHAPTER_NOT_READY');
  return result.docs.map(doc => mapSummary(mapFromDocument(doc.data(), content)));
}
