import { cpSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const assetDirs = ['SPRITES', 'ANIMATIONS', 'font', 'music', 'sfx'];
const sourceRoot = 'ASSETS';
const targetRoot = join('dist', 'ASSETS');

mkdirSync(targetRoot, { recursive: true });

for (const dir of assetDirs) {
  cpSync(join(sourceRoot, dir), join(targetRoot, dir), { recursive: true });
}
