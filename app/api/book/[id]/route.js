import { fetchDriveFile } from '@/lib/googleDrive';
import { readLocalBook } from '@/lib/localBooks';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    if (params.id.startsWith('local-')) {
      const { file, stat, filename } = await readLocalBook(params.id);
      return new Response(file, {
        status: 200,
        headers: {
          'Content-Type': 'application/epub+zip',
          'Content-Length': String(stat.size),
          'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(filename)}`,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }

    const range = request.headers.get('range');
    const driveResponse = await fetchDriveFile(params.id, range);

    if (!driveResponse.ok && driveResponse.status !== 206) {
      const text = await driveResponse.text();
      return new Response(text, { status: driveResponse.status });
    }

    const headers = new Headers();
    const passHeaders = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified'];
    for (const key of passHeaders) {
      const value = driveResponse.headers.get(key);
      if (value) headers.set(key, value);
    }
    headers.set('Content-Type', driveResponse.headers.get('content-type') || 'application/epub+zip');
    headers.set('Cache-Control', 'private, max-age=0, must-revalidate');

    return new Response(driveResponse.body, {
      status: driveResponse.status,
      headers,
    });
  } catch (error) {
    return new Response(error.message || 'Cannot download book', { status: 500 });
  }
}
