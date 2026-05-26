import { NextResponse } from 'next/server';
import { listEpubFiles, getDriveConfig } from '@/lib/googleDrive';
import { listLocalBooks } from '@/lib/localBooks';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    let driveBooks = [];
    try {
      getDriveConfig();
      driveBooks = await listEpubFiles();
    } catch (driveError) {
      driveBooks = [];
    }
    const localBooks = await listLocalBooks();
    return NextResponse.json({ books: [...driveBooks, ...localBooks] });
  } catch (error) {
    return NextResponse.json(
      { error: error.message || 'Cannot load books' },
      { status: 500 }
    );
  }
}
