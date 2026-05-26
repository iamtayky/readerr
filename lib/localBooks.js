import fs from 'node:fs/promises';
import path from 'node:path';

const BOOK_DIR = path.join(process.cwd(), 'public', 'books');

export async function listLocalBooks() {
  try {
    const entries = await fs.readdir(BOOK_DIR, { withFileTypes: true });
    const books = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.epub')) continue;
      const fullPath = path.join(BOOK_DIR, entry.name);
      const stat = await fs.stat(fullPath);
      books.push({
        id: `local-${encodeURIComponent(entry.name)}`,
        name: entry.name,
        size: stat.size,
        modifiedTime: stat.mtime.toISOString(),
        local: true,
      });
    }
    return books.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  } catch {
    return [];
  }
}

export async function readLocalBook(localId) {
  const encodedName = localId.replace(/^local-/, '');
  const filename = decodeURIComponent(encodedName);
  if (filename.includes('/') || filename.includes('\\') || !filename.toLowerCase().endsWith('.epub')) {
    throw new Error('Invalid local book id');
  }
  const fullPath = path.join(BOOK_DIR, filename);
  const file = await fs.readFile(fullPath);
  const stat = await fs.stat(fullPath);
  return { file, stat, filename };
}
