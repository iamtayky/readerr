'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Library, ListTree, Maximize2, Minimize2, Moon, RefreshCw, Search, Settings, Sun } from 'lucide-react';

function formatBytes(bytes) {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function cleanTitle(name) {
  return name?.replace(/\.epub$/i, '') || 'Khong ro ten sach';
}

export default function ReaderApp() {
  const viewerRef = useRef(null);
  const bookRef = useRef(null);
  const renditionRef = useRef(null);
  const objectUrlRef = useRef(null);
  const tocRef = useRef([]);

  const [books, setBooks] = useState([]);
  const [selectedBook, setSelectedBook] = useState(null);
  const [toc, setToc] = useState([]);
  const [query, setQuery] = useState('');
  const [loadingBooks, setLoadingBooks] = useState(true);
  const [loadingBook, setLoadingBook] = useState(false);
  const [error, setError] = useState('');
  const [darkMode, setDarkMode] = useState(false);
  const [readerMode, setReaderMode] = useState(false);
  const [showToc, setShowToc] = useState(false);
  const [fontSize, setFontSize] = useState(100);
  const [progress, setProgress] = useState(0);
  const [currentChapter, setCurrentChapter] = useState('');
  const [status, setStatus] = useState('Chua mo sach');

  useEffect(() => {
    const storedTheme = localStorage.getItem('reader.theme');
    const storedSize = Number(localStorage.getItem('reader.fontSize') || '100');
    setDarkMode(storedTheme === 'dark');
    if (storedSize >= 70 && storedSize <= 180) setFontSize(storedSize);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('reader.theme', darkMode ? 'dark' : 'light');
    const rendition = renditionRef.current;
    if (rendition) {
      rendition.themes.select(darkMode ? 'dark' : 'light');
    }
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem('reader.fontSize', String(fontSize));
    const rendition = renditionRef.current;
    if (rendition) rendition.themes.fontSize(`${fontSize}%`);
  }, [fontSize]);

  const loadBooks = useCallback(async () => {
    setLoadingBooks(true);
    setError('');
    try {
      const response = await fetch('/api/books', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Khong tai duoc danh sach sach');
      const nextBooks = data.books || [];
      setBooks(nextBooks);
      setSelectedBook((current) => current || nextBooks[0] || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingBooks(false);
    }
  }, []);

  useEffect(() => {
    loadBooks();
  }, [loadBooks]);

  const filteredBooks = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return books;
    return books.filter((book) => book.name.toLowerCase().includes(value));
  }, [books, query]);

  const destroyCurrentBook = useCallback(() => {
    if (renditionRef.current) {
      renditionRef.current.destroy();
      renditionRef.current = null;
    }
    if (bookRef.current) {
      bookRef.current.destroy();
      bookRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const updateProgress = useCallback((location) => {
    const book = bookRef.current;
    if (!book || !book.locations || !location?.start?.cfi) return;

    const percentage = book.locations.percentageFromCfi(location.start.cfi) || 0;
    setProgress(Math.round(percentage * 1000) / 10);

    const chapter = tocRef.current.find((item) => item.href && location.start.href && location.start.href.includes(item.href.split('#')[0]));
    if (chapter?.label) setCurrentChapter(chapter.label.trim());

    if (selectedBook?.id) {
      localStorage.setItem(`reader.position.${selectedBook.id}`, location.start.cfi);
    }
  }, [selectedBook?.id]);

  const openBook = useCallback(async (bookMeta) => {
    if (!bookMeta) return;
    setSelectedBook(bookMeta);
    setLoadingBook(true);
    setStatus('Dang tai file EPUB...');
    setToc([]);
    setProgress(0);
    setCurrentChapter('');
    setError('');

    try {
      destroyCurrentBook();
      const response = await fetch(`/api/book/${bookMeta.id}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(await response.text());

      // Doc EPUB thanh ArrayBuffer thay vi blob URL. Cach nay on dinh hon tren Vercel/Chrome
      // va tranh viec epub.js bi treo khi request lai object URL.
      const arrayBuffer = await response.arrayBuffer();

      const { default: ePub } = await import('epubjs');
      const book = ePub(arrayBuffer);
      bookRef.current = book;

      setStatus('Dang mo khung doc...');
      const rendition = book.renderTo(viewerRef.current, {
        width: '100%',
        height: '100%',
        spread: 'none',
        flow: 'paginated',
        allowScriptedContent: false,
      });
      renditionRef.current = rendition;

      rendition.themes.register('light', {
        body: { color: '#1f2937', background: '#fffaf2', 'line-height': '1.75' },
        p: { 'margin-bottom': '0.9em' },
        a: { color: '#7c3aed' },
      });
      rendition.themes.register('dark', {
        body: { color: '#e5e7eb', background: '#111827', 'line-height': '1.75' },
        p: { 'margin-bottom': '0.9em' },
        a: { color: '#a78bfa' },
      });
      rendition.themes.select(darkMode ? 'dark' : 'light');
      rendition.themes.fontSize(`${fontSize}%`);

      rendition.on('relocated', updateProgress);
      rendition.on('rendered', () => setStatus('Dang doc'));

      // Hien thi trang dau tien ngay lap tuc. Khong doi tao location/progress,
      // vi sach nay co gan 3.000 file XHTML nen generate location co the mat rat lau.
      setStatus('Dang hien thi trang dau...');
      const saved = localStorage.getItem(`reader.position.${bookMeta.id}`);
      await rendition.display(saved || undefined);

      // Tai muc luc o nen, khong chan viec mo sach.
      book.loaded.navigation
        .then((navigation) => {
          tocRef.current = navigation?.toc || [];
          setToc(tocRef.current);
        })
        .catch(() => {
          tocRef.current = [];
          setToc([]);
        });

      // Tao location o nen voi do chi tiet thap hon. Neu that bai thi van doc duoc sach.
      setTimeout(() => {
        book.locations.generate(300).catch(() => null);
      }, 800);
    } catch (err) {
      setError(err.message || 'Khong mo duoc sach');
      setStatus('Loi khi mo sach');
    } finally {
      setLoadingBook(false);
    }
  }, [darkMode, destroyCurrentBook, fontSize, updateProgress]);

  useEffect(() => {
    if (selectedBook && !bookRef.current && !loadingBook) openBook(selectedBook);
  }, [selectedBook, loadingBook, openBook]);

  useEffect(() => {
    return () => destroyCurrentBook();
  }, [destroyCurrentBook]);

  const goNext = useCallback(async () => {
    if (!renditionRef.current) return;
    setStatus('Dang chuyen trang...');
    await renditionRef.current.next();
  }, []);

  const goPrev = useCallback(async () => {
    if (!renditionRef.current) return;
    setStatus('Dang chuyen trang...');
    await renditionRef.current.prev();
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'ArrowRight') goNext();
      if (event.key === 'ArrowLeft') goPrev();
      if (event.key === 'Escape') setReaderMode(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev]);

  const jumpTo = async (href) => {
    if (!renditionRef.current) return;
    setShowToc(false);
    setStatus('Dang chuyen chuong...');
    await renditionRef.current.display(href);
  };

  return (
    <main className={`app-shell ${readerMode ? 'reader-focus' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon"><BookOpen size={22} /></div>
          <div>
            <h1>Drive EPUB Reader</h1>
            <p>Doc sach tu Google Drive</p>
          </div>
        </div>

        <div className="search-box">
          <Search size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tim sach..." />
        </div>

        <button className="secondary-btn" onClick={loadBooks} disabled={loadingBooks}>
          <RefreshCw size={16} className={loadingBooks ? 'spin' : ''} /> Tai lai thu vien
        </button>

        {error && <div className="error-box">{error}</div>}

        <div className="book-list">
          {loadingBooks ? (
            <div className="empty">Dang lay danh sach tu Drive...</div>
          ) : filteredBooks.length ? (
            filteredBooks.map((book) => (
              <button
                key={book.id}
                className={`book-card ${selectedBook?.id === book.id ? 'active' : ''}`}
                onClick={() => openBook(book)}
              >
                <div className="book-cover"><Library size={22} /></div>
                <div>
                  <strong>{cleanTitle(book.name)}</strong>
                  <span>{formatBytes(book.size)} {book.modifiedTime ? `- ${new Date(book.modifiedTime).toLocaleDateString('vi-VN')}` : ''}</span>
                </div>
              </button>
            ))
          ) : (
            <div className="empty">Khong co file .epub trong folder Drive.</div>
          )}
        </div>
      </aside>

      <section className="reader-panel">
        <header className="topbar">
          <div className="title-area">
            <span>{status}</span>
            <h2>{selectedBook ? cleanTitle(selectedBook.name) : 'Chon mot cuon sach'}</h2>
            <p>{currentChapter || 'Dung phim mui ten trai/phai de chuyen trang'}</p>
          </div>
          <div className="toolbar">
            <button onClick={() => setShowToc((v) => !v)} title="Muc luc"><ListTree size={18} /></button>
            <button onClick={() => setFontSize((v) => Math.max(70, v - 10))}>A-</button>
            <button onClick={() => setFontSize((v) => Math.min(180, v + 10))}>A+</button>
            <button onClick={() => setDarkMode((v) => !v)} title="Dark mode">{darkMode ? <Sun size={18} /> : <Moon size={18} />}</button>
            <button onClick={() => setReaderMode((v) => !v)} title="Che do doc sach">{readerMode ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>
            <button className="settings-pill"><Settings size={16} /> {fontSize}%</button>
          </div>
        </header>

        <div className="progress-wrap"><div style={{ width: `${progress}%` }} /></div>

        <div className="reader-wrap">
          <button className="nav-btn left" onClick={goPrev} aria-label="Trang truoc"><ChevronLeft size={28} /></button>
          <div className="epub-viewer" ref={viewerRef}>
            {!selectedBook && <div className="empty big">Hay chon sach trong thu vien ben trai.</div>}
            {loadingBook && <div className="loading-overlay">Dang mo sach...</div>}
          </div>
          <button className="nav-btn right" onClick={goNext} aria-label="Trang sau"><ChevronRight size={28} /></button>
        </div>
      </section>

      {showToc && (
        <div className="toc-drawer">
          <div className="toc-header">
            <strong>Muc luc</strong>
            <button onClick={() => setShowToc(false)}>Dong</button>
          </div>
          <div className="toc-list">
            {toc.length ? toc.map((item, index) => (
              <button key={`${item.href}-${index}`} onClick={() => jumpTo(item.href)}>
                {item.label?.trim() || `Chuong ${index + 1}`}
              </button>
            )) : <p>File nay khong co muc luc ro rang.</p>}
          </div>
        </div>
      )}
    </main>
  );
}
