export const ENEMY_AVATAR_URLS: Readonly<Record<string, string>> = {
  enemyAvatar7: 'https://firebasestorage.googleapis.com/v0/b/sword-puzzle.firebasestorage.app/o/enemy-avatars%2Fruntime%2Fv1%2Fmap-7-guardian.webp?alt=media&token=bf8150cc-c3de-4c23-a407-c16ba1a5d4e4',
  enemyAvatar10: 'https://firebasestorage.googleapis.com/v0/b/sword-puzzle.firebasestorage.app/o/enemy-avatars%2Fruntime%2Fv1%2Fmap-10-mountain-king.webp?alt=media&token=e9b470f2-3de9-48e2-ad8e-ef0b2f557ea7',
  enemyAvatar17: 'https://firebasestorage.googleapis.com/v0/b/sword-puzzle.firebasestorage.app/o/enemy-avatars%2Fruntime%2Fv1%2Fmap-17-sword-senior.webp?alt=media&token=264a33c4-382b-4f4a-bd9d-61966b05b75a',
  enemyAvatar19: 'https://firebasestorage.googleapis.com/v0/b/sword-puzzle.firebasestorage.app/o/enemy-avatars%2Fruntime%2Fv1%2Fmap-19-challenger.webp?alt=media&token=62e1bf47-6c3a-4ce6-ba20-7bcce4c182d5',
  enemyAvatar20: 'https://firebasestorage.googleapis.com/v0/b/sword-puzzle.firebasestorage.app/o/enemy-avatars%2Fruntime%2Fv1%2Fmap-20-formation-spirit.webp?alt=media&token=9c4b6559-f843-466e-b5e4-29f373a257e4',
  enemyAvatar27: 'https://firebasestorage.googleapis.com/v0/b/sword-puzzle.firebasestorage.app/o/enemy-avatars%2Fruntime%2Fv1%2Fmap-27-tiger-beast.webp?alt=media&token=7e3e10c4-4a53-4477-8b75-ec7d638bec96',
  enemyAvatar29: 'https://firebasestorage.googleapis.com/v0/b/sword-puzzle.firebasestorage.app/o/enemy-avatars%2Fruntime%2Fv1%2Fmap-29-qilin-beast.webp?alt=media&token=32894cdd-81c5-452d-992d-77f69d01b683',
  enemyAvatar30: 'https://firebasestorage.googleapis.com/v0/b/sword-puzzle.firebasestorage.app/o/enemy-avatars%2Fruntime%2Fv1%2Fmap-30-sky-dragon.webp?alt=media&token=c2459d53-363e-4528-85c0-21deea8b6f2d',
};

export function enemyAvatarURL(artKey: string | undefined) {
  return artKey ? ENEMY_AVATAR_URLS[artKey] : undefined;
}
