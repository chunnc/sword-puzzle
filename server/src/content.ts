import { getFirestore } from 'firebase-admin/firestore';
import { validateContent, type GameContent } from './domain/game';
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
