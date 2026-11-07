import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { firebaseCliServices } from './firebase_cli_credentials.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const project = 'sword-puzzle';
const bucketName = `${project}.firebasestorage.app`;
const storageVersion = 1;
const avatarDirectory = path.join(root, 'assets/ui-source/enemy-avatars');
const runtimeDirectory = path.join(root, 'client/app-assets/ui/enemy-avatars');
const entries = [
  ['map-7-guardian', 'enemyAvatar7'],
  ['map-10-mountain-king', 'enemyAvatar10'],
  ['map-17-sword-senior', 'enemyAvatar17'],
  ['map-19-challenger', 'enemyAvatar19'],
  ['map-20-formation-spirit', 'enemyAvatar20'],
  ['map-27-tiger-beast', 'enemyAvatar27'],
  ['map-29-qilin-beast', 'enemyAvatar29'],
  ['map-30-sky-dragon', 'enemyAvatar30'],
];

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

function md5Base64(data) {
  return createHash('md5').update(data).digest('base64');
}

function firebaseDownloadURL(objectPath, token) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
}

async function ensureObject(request, bucketName, objectPath, localPath, contentType, tokens = false) {
  const bytes = await fs.readFile(localPath);
  const checksum = sha256(bytes);
  const existing = await listObjects(request, bucketName, objectPath);
  let metadata = existing.get(objectPath);

  if (!metadata) {
    const token = tokens ? randomUUID() : undefined;
    const objectMetadata = {
      name: objectPath,
      contentType,
      cacheControl: 'private, no-store',
      metadata: {
        sourceSha256: checksum,
        ...(token ? { firebaseStorageDownloadTokens: token } : {}),
      },
    };
    const boundary = `enemy-avatar-${randomUUID()}`;
    const body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(objectMetadata)}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`),
      bytes,
      Buffer.from(`\r\n--${boundary}--`),
    ]);
    try {
      await request({
        url: `https://storage.googleapis.com/upload/storage/v1/b/${bucketName}/o?uploadType=multipart&ifGenerationMatch=0`,
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
        data: body,
        timeout: 30000,
      });
    } catch (error) {
      if (error.response?.status !== 412) throw error;
    }
    metadata = (await listObjects(request, bucketName, objectPath)).get(objectPath);
  }

  if (!metadata || metadata.md5Hash !== md5Base64(bytes) || metadata.metadata?.sourceSha256 !== checksum) {
    throw new Error(`Stored object checksum verification failed or stored content differs: ${objectPath}`);
  }
  if (metadata.contentType !== contentType || metadata.cacheControl !== 'private, no-store') {
    throw new Error(`Stored object has unexpected delivery metadata: ${objectPath}`);
  }

  const token = tokens ? metadata.metadata?.firebaseStorageDownloadTokens?.split(',')[0] : undefined;
  if (tokens && !token) throw new Error(`Runtime image is missing its Firebase download token: ${objectPath}`);
  return { path: objectPath, sha256: checksum, size: bytes.length, ...(token ? { url: firebaseDownloadURL(objectPath, token) } : {}) };
}

async function listObjects(request, bucketName, objectPath) {
  const objects = new Map();
  let pageToken;
  do {
    const params = new URLSearchParams({
      prefix: objectPath,
      fields: 'items(name,md5Hash,size,contentType,cacheControl,metadata),nextPageToken',
      ...(pageToken ? { pageToken } : {}),
    });
    const { data } = await request({ url: `https://storage.googleapis.com/storage/v1/b/${bucketName}/o?${params}` });
    for (const item of data.items ?? []) objects.set(item.name, item);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return objects;
}

async function verifyPublicRuntime(item) {
  const response = await fetch(item.url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Public runtime download returned ${response.status}: ${item.path}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (sha256(data) !== item.sha256) throw new Error(`Public runtime download checksum verification failed: ${item.path}`);
}

async function writeClientURLRegistry(runtime) {
  const rows = runtime.map(item => `  ${item.key}: '${item.url}',`).join('\n');
  const source = `export const ENEMY_AVATAR_URLS: Readonly<Record<string, string>> = {\n${rows}\n};\n\nexport function enemyAvatarURL(artKey: string | undefined) {\n  return artKey ? ENEMY_AVATAR_URLS[artKey] : undefined;\n}\n`;
  await fs.writeFile(path.join(root, 'client/src/enemyAvatars.ts'), source);
}

export async function uploadEnemyAvatars({ deleteLocal = false } = {}) {
  const local = [];
  for (const [filename, key] of entries) {
    local.push({ name: filename, path: path.join(avatarDirectory, `${filename}.png`), type: 'image/png', key: undefined });
    local.push({ name: filename, path: path.join(runtimeDirectory, `${filename}.webp`), type: 'image/webp', key });
  }
  for (const item of local) await fs.access(item.path);

  const { db, request } = await firebaseCliServices(project);
  const saved = [];
  try {
    const { data: bucketResource } = await request({
      url: 'https://firebasestorage.googleapis.com/v1alpha/projects/227640149497/defaultBucket',
    });
    if (bucketResource.bucket?.name !== `projects/227640149497/buckets/${bucketName}`
      || bucketResource.location !== 'ASIA-SOUTHEAST1') {
      throw new Error(`Unexpected Firebase Storage bucket or region: ${bucketResource.bucket?.name} (${bucketResource.location})`);
    }
    for (const item of local) {
      const isRuntime = item.type === 'image/webp';
      const objectPath = `${isRuntime ? `enemy-avatars/runtime/v${storageVersion}` : `enemy-avatars/source/v${storageVersion}`}/${path.basename(item.path)}`;
      saved.push({ ...item, ...(await ensureObject(request, bucketName, objectPath, item.path, item.type, isRuntime)) });
    }

    const runtime = saved.filter(item => item.type === 'image/webp');
    await Promise.all(runtime.map(verifyPublicRuntime));

    for (const item of saved.filter(item => item.type === 'image/png')) {
      const response = await fetch(`https://storage.googleapis.com/${bucketName}/${item.path}`);
      if (response.status !== 403) throw new Error(`Source PNG must remain private; got HTTP ${response.status}: ${item.path}`);
    }
    for (const item of runtime) {
      const publicURL = new URL(item.url);
      publicURL.searchParams.delete('token');
      const response = await fetch(publicURL, { cache: 'no-store' });
      if (response.status !== 403) throw new Error(`Runtime image without its download token must be denied; got HTTP ${response.status}: ${item.path}`);
    }

    await writeClientURLRegistry(runtime);

    if (deleteLocal) {
      for (const item of local) await fs.unlink(item.path);
    }

    return saved.map(({ name, path: objectPath, type, sha256: checksum, size }) => ({ name, path: objectPath, type, sha256: checksum, size }));
  } finally {
    await db.terminate();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const deleteLocal = args.includes('--delete-local');
  if (args.some(arg => arg !== '--delete-local')) throw new Error('Usage: node tools/upload_enemy_avatars.mjs [--delete-local]');
  uploadEnemyAvatars({ deleteLocal })
    .then(receipt => console.log(JSON.stringify({ bucket: bucketName, count: receipt.length, images: receipt }, null, 2)))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
