'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ChevronLeft, ChevronRight, Library, ListTree, LogIn, LogOut, Maximize2, Minimize2, Moon, PanelLeft, RefreshCw, Search, Settings, Sun, User, X } from 'lucide-react';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';

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
  const touchStartRef = useRef(null);
  const selectedBookRef = useRef(null);
  const saveTimerRef = useRef(null);
  const userRef = useRef(null);

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
  const [showLibrary, setShowLibrary] = useState(false);
  const [fontSize, setFontSize] = useState(100);
  const [progress, setProgress] = useState(0);
  const [currentChapter, setCurrentChapter] = useState('');
  const [status, setStatus] = useState('Chua mo sach');
  const [lastReadMap, setLastReadMap] = useState({});
  const [user, setUser] = useState(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authMode, setAuthMode] = useState('login');
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState('');

  useEffect(() => {
    const storedTheme = localStorage.getItem('reader.theme');
    const storedSize = Number(localStorage.getItem('reader.fontSize') || '100');
    setDarkMode(storedTheme === 'dark');
    if (storedSize >= 70 && storedSize <= 180) setFontSize(storedSize);

    try {
      setLastReadMap(JSON.parse(localStorage.getItem('reader.lastReadMap') || '{}'));
    } catch (_) {
      setLastReadMap({});
    }
  }, []);

  useEffect(() => {
    selectedBookRef.current = selectedBook;
  }, [selectedBook]);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setUser(data.session?.user || null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => {
      alive = false;
      listener?.subscription?.unsubscribe?.();
    };
  }, []);

  const loadCloudProgressMap = useCallback(async (activeUser) => {
    if (!activeUser || !supabase) return;
    try {
      const { data, error: cloudError } = await supabase
        .from('reading_progress')
        .select('book_id, book_title, cfi, href, chapter_label, progress, updated_at')
        .eq('user_id', activeUser.id)
        .order('updated_at', { ascending: false });

      if (cloudError) throw cloudError;

      const cloudMap = {};
      for (const row of data || []) {
        cloudMap[row.book_id] = {
          bookId: row.book_id,
          bookName: row.book_title,
          cfi: row.cfi,
          href: row.href,
          chapter: row.chapter_label,
          progress: typeof row.progress === 'number' ? row.progress : Number(row.progress || 0),
          updatedAt: row.updated_at,
          source: 'cloud',
        };
      }

      setLastReadMap((current) => {
        const next = { ...current, ...cloudMap };
        localStorage.setItem('reader.lastReadMap', JSON.stringify(next));
        Object.entries(cloudMap).forEach(([bookId, record]) => {
          localStorage.setItem(`reader.lastRead.${bookId}`, JSON.stringify(record));
          if (record.cfi) localStorage.setItem(`reader.position.${bookId}`, record.cfi);
        });
        return next;
      });
    } catch (err) {
      setAuthMessage(`Khong dong bo duoc tien do: ${err.message}`);
    }
  }, []);

  useEffect(() => {
    if (user) loadCloudProgressMap(user);
  }, [user, loadCloudProgressMap]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('reader.theme', darkMode ? 'dark' : 'light');
    const rendition = renditionRef.current;
    if (rendition) rendition.themes.select(darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem('reader.fontSize', String(fontSize));
    const rendition = renditionRef.current;
    if (rendition) rendition.themes.fontSize(`${fontSize}%`);
  }, [fontSize]);

  useEffect(() => {
    document.body.classList.toggle('modal-open', showLibrary || showToc);
    return () => document.body.classList.remove('modal-open');
  }, [showLibrary, showToc]);

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


  const persistLastRead = useCallback((bookId, payload) => {
    if (!bookId) return;

    const record = {
      ...payload,
      updatedAt: new Date().toISOString(),
    };

    localStorage.setItem(`reader.position.${bookId}`, record.cfi || '');
    localStorage.setItem(`reader.lastRead.${bookId}`, JSON.stringify(record));

    setLastReadMap((current) => {
      const next = { ...current, [bookId]: record };
      localStorage.setItem('reader.lastReadMap', JSON.stringify(next));
      return next;
    });

    const activeUser = userRef.current;
    if (activeUser && supabase) {
      supabase
        .from('reading_progress')
        .upsert({
          user_id: activeUser.id,
          book_id: bookId,
          book_title: record.bookName || record.bookTitle || '',
          cfi: record.cfi || null,
          href: record.href || null,
          chapter_label: record.chapter || '',
          progress: typeof record.progress === 'number' ? record.progress : 0,
          updated_at: record.updatedAt,
        }, { onConflict: 'user_id,book_id' })
        .then(({ error: cloudError }) => {
          if (cloudError) setAuthMessage(`Luu online loi: ${cloudError.message}`);
        });
    }
  }, []);

  const getLocalReadingPoint = useCallback((bookId) => {
    if (!bookId) return null;

    try {
      const full = JSON.parse(localStorage.getItem(`reader.lastRead.${bookId}`) || 'null');
      if (full?.cfi || full?.href) return full;
    } catch (_) {
      // Fallback sang key cu.
    }

    const legacyCfi = localStorage.getItem(`reader.position.${bookId}`);
    return legacyCfi ? { cfi: legacyCfi } : null;
  }, []);

  const getSavedReadingPoint = useCallback(async (bookId) => {
    const localPoint = getLocalReadingPoint(bookId);
    const activeUser = userRef.current;
    if (!bookId || !activeUser || !supabase) return localPoint;

    try {
      const { data, error: cloudError } = await supabase
        .from('reading_progress')
        .select('book_id, book_title, cfi, href, chapter_label, progress, updated_at')
        .eq('user_id', activeUser.id)
        .eq('book_id', bookId)
        .maybeSingle();

      if (cloudError) throw cloudError;
      if (!data) return localPoint;

      const cloudPoint = {
        bookId: data.book_id,
        bookName: data.book_title,
        cfi: data.cfi,
        href: data.href,
        chapter: data.chapter_label,
        progress: typeof data.progress === 'number' ? data.progress : Number(data.progress || 0),
        updatedAt: data.updated_at,
        source: 'cloud',
      };

      if (!localPoint?.updatedAt) return cloudPoint;
      return new Date(cloudPoint.updatedAt || 0) >= new Date(localPoint.updatedAt || 0) ? cloudPoint : localPoint;
    } catch (err) {
      setAuthMessage(`Khong lay duoc tien do online: ${err.message}`);
      return localPoint;
    }
  }, [getLocalReadingPoint]);

  const updateProgress = useCallback((location) => {
    const book = bookRef.current;
    const bookMeta = selectedBookRef.current;
    if (!book || !location?.start) return;

    const cfi = location.start.cfi || '';
    const href = location.start.href || (typeof location.start.index === 'number' ? book?.spine?.get(location.start.index)?.href : '') || '';

    let nextProgress = progress;
    if (book.locations && cfi) {
      try {
        const percentage = book.locations.percentageFromCfi(cfi) || 0;
        nextProgress = Math.round(percentage * 1000) / 10;
        setProgress(nextProgress);
      } catch (_) {
        // Co file EPUB chua tao xong locations. Van luu CFI de doc tiep.
      }
    }

    const chapter = tocRef.current.find((item) => item.href && href && href.includes(item.href.split('#')[0]));
    const chapterLabel = chapter?.label?.trim() || currentChapter || '';
    if (chapterLabel) setCurrentChapter(chapterLabel);

    if (bookMeta?.id && cfi) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        persistLastRead(bookMeta.id, {
          bookId: bookMeta.id,
          bookName: bookMeta.name,
          cfi,
          href,
          chapter: chapterLabel,
          progress: nextProgress,
        });
      }, 250);
    }
  }, [currentChapter, persistLastRead, progress]);

  const getCurrentHref = useCallback(() => {
    const rendition = renditionRef.current;
    const book = bookRef.current;
    const location = rendition?.currentLocation?.();
    let href = location?.start?.href;
    if (!href && typeof location?.start?.index === 'number') {
      href = book?.spine?.get(location.start.index)?.href;
    }
    return href || '';
  }, []);

  const normalizeHref = useCallback((value) => {
    return String(value || '')
      .trim()
      .replace(/^epub:\/\//i, '')
      .replace(/^\/+/, '')
      .replace(/\\/g, '/')
      .split('?')[0];
  }, []);

  const makeInternalCandidates = useCallback((rawHref) => {
    const currentHref = getCurrentHref();
    const raw = String(rawHref || '').trim();
    const candidates = [];
    const add = (value) => {
      const normalized = normalizeHref(value);
      if (normalized && !candidates.includes(normalized)) candidates.push(normalized);
    };

    if (!raw) return candidates;

    if (raw.startsWith('#')) {
      if (currentHref) add(`${currentHref}${raw}`);
      return candidates;
    }

    add(raw);

    const safeBase = currentHref ? `https://epub.local/${currentHref}` : 'https://epub.local/';
    try {
      const resolved = new URL(raw, safeBase);
      add(`${resolved.pathname}${resolved.hash}`);
    } catch (_) {
      // Bo qua URL khong hop le.
    }

    try {
      add(decodeURIComponent(raw));
    } catch (_) {
      // Bo qua href khong decode duoc.
    }

    const fileName = normalizeHref(raw).split('#')[0].split('/').pop();
    const hash = raw.includes('#') ? `#${raw.split('#').slice(1).join('#')}` : '';
    if (fileName) add(`${fileName}${hash}`);

    return candidates;
  }, [getCurrentHref, normalizeHref]);

  const findSpineTarget = useCallback((rawHref) => {
    const book = bookRef.current;
    const candidates = makeInternalCandidates(rawHref);
    const spineItems = book?.spine?.spineItems || [];

    for (const candidate of candidates) {
      const path = candidate.split('#')[0];
      const hash = candidate.includes('#') ? `#${candidate.split('#').slice(1).join('#')}` : '';
      const pathLower = path.toLowerCase();
      const pathFile = pathLower.split('/').pop();

      const matched = spineItems.find((item) => {
        const href = normalizeHref(item.href || item.url || '');
        const hrefLower = href.toLowerCase();
        const hrefFile = hrefLower.split('/').pop();
        return hrefLower === pathLower || hrefLower.endsWith(`/${pathLower}`) || pathLower.endsWith(`/${hrefLower}`) || hrefFile === pathFile;
      });

      if (matched?.href) return `${matched.href}${hash}`;
    }

    return candidates[0] || '';
  }, [makeInternalCandidates, normalizeHref]);

  const displayTarget = useCallback(async (rawHref) => {
    const rendition = renditionRef.current;
    if (!rendition || !rawHref) return;

    const href = String(rawHref).trim();
    if (!href) return;

    if (/^(https?:|mailto:|tel:)/i.test(href)) {
      window.open(href, '_blank', 'noopener,noreferrer');
      return;
    }

    const target = findSpineTarget(href);
    if (!target) throw new Error('Khong tim thay lien ket trong EPUB');

    try {
      await rendition.display(target);
      return;
    } catch (firstError) {
      const candidates = makeInternalCandidates(href);
      for (const candidate of candidates) {
        try {
          await rendition.display(candidate);
          return;
        } catch (_) {
          // Thu ung vien tiep theo.
        }
      }
      throw firstError || new Error('Khong chuyen duoc chuong');
    }
  }, [findSpineTarget, makeInternalCandidates]);

  const openBook = useCallback(async (bookMeta) => {
    if (!bookMeta) return;
    setSelectedBook(bookMeta);
    setShowLibrary(false);
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

      const handleInternalLink = (href) => {
        if (!href) return;
        setStatus('Dang chuyen chuong...');
        displayTarget(href).catch((err) => {
          setError(err.message || 'Khong chuyen duoc chuong');
          setStatus('Loi khi chuyen chuong');
        });
      };

      rendition.on('linkClicked', (href) => {
        handleInternalLink(href);
      });

      rendition.hooks.content.register((contents) => {
        const doc = contents?.document;
        if (!doc) return;

        doc.querySelectorAll('a[href]').forEach((anchor) => {
          anchor.removeAttribute('target');
          anchor.setAttribute('data-reader-link', 'true');
        });

        doc.addEventListener('click', (event) => {
          const anchor = event.target?.closest?.('a[href]');
          if (!anchor) return;

          const href = anchor.getAttribute('href');
          if (!href) return;

          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation?.();

          handleInternalLink(href);
        }, true);
      });

      rendition.themes.register('light', {
        body: {
          color: '#1f2937',
          background: '#fffaf2',
          'line-height': '1.78',
          'padding': '0 2px',
        },
        p: { 'margin-bottom': '0.9em' },
        a: { color: '#7c3aed', cursor: 'pointer', 'touch-action': 'manipulation' },
        img: { 'max-width': '100%', height: 'auto' },
      });
      rendition.themes.register('dark', {
        body: {
          color: '#e5e7eb',
          background: '#111827',
          'line-height': '1.78',
          'padding': '0 2px',
        },
        p: { 'margin-bottom': '0.9em' },
        a: { color: '#a78bfa', cursor: 'pointer', 'touch-action': 'manipulation' },
        img: { 'max-width': '100%', height: 'auto' },
      });
      rendition.themes.select(darkMode ? 'dark' : 'light');
      rendition.themes.fontSize(`${fontSize}%`);

      rendition.on('relocated', updateProgress);
      rendition.on('rendered', () => setStatus('Dang doc'));

      setStatus('Dang hien thi trang dau...');
      const saved = await getSavedReadingPoint(bookMeta.id);
      if (saved?.chapter) setCurrentChapter(saved.chapter);
      if (typeof saved?.progress === 'number') setProgress(saved.progress);

      try {
        await rendition.display(saved?.cfi || saved?.href || undefined);
      } catch (_) {
        await rendition.display(saved?.href || undefined);
      }

      book.loaded.navigation
        .then((navigation) => {
          tocRef.current = navigation?.toc || [];
          setToc(tocRef.current);
        })
        .catch(() => {
          tocRef.current = [];
          setToc([]);
        });

      setTimeout(() => {
        book.locations.generate(300).catch(() => null);
      }, 800);
    } catch (err) {
      setError(err.message || 'Khong mo duoc sach');
      setStatus('Loi khi mo sach');
    } finally {
      setLoadingBook(false);
    }
  }, [darkMode, destroyCurrentBook, displayTarget, fontSize, getSavedReadingPoint, updateProgress]);

  useEffect(() => {
    if (selectedBook && !bookRef.current && !loadingBook) openBook(selectedBook);
  }, [selectedBook, loadingBook, openBook]);

  useEffect(() => {
    return () => {
      window.clearTimeout(saveTimerRef.current);
      destroyCurrentBook();
    };
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
      if (event.key === 'Escape') {
        setReaderMode(false);
        setShowLibrary(false);
        setShowToc(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev]);

  const jumpTo = async (href) => {
    if (!renditionRef.current) return;
    setShowToc(false);
    setStatus('Dang chuyen chuong...');
    try {
      await displayTarget(href);
    } catch (err) {
      setError(err.message || 'Khong chuyen duoc chuong');
      setStatus('Loi khi chuyen chuong');
    }
  };

  const handleTouchStart = (event) => {
    const touch = event.changedTouches?.[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  };

  const handleTouchEnd = (event) => {
    const start = touchStartRef.current;
    const touch = event.changedTouches?.[0];
    if (!start || !touch) return;

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const elapsed = Date.now() - start.time;
    touchStartRef.current = null;

    if (elapsed > 700 || Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.35) return;
    if (dx < 0) goNext();
    else goPrev();
  };


  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    if (!supabase) {
      setAuthMessage('Chua cau hinh Supabase tren Vercel.');
      return;
    }
    if (!authEmail || !authPassword) {
      setAuthMessage('Nhap email va mat khau.');
      return;
    }

    setAuthBusy(true);
    setAuthMessage('');
    try {
      const action = authMode === 'signup'
        ? supabase.auth.signUp({ email: authEmail, password: authPassword })
        : supabase.auth.signInWithPassword({ email: authEmail, password: authPassword });
      const { data, error: authError } = await action;
      if (authError) throw authError;

      if (authMode === 'signup' && !data.session) {
        setAuthMessage('Da tao tai khoan. Hay kiem tra email de xac nhan neu Supabase yeu cau.');
      } else {
        setAuthMessage('Da dang nhap va dang dong bo tien do doc.');
      }
    } catch (err) {
      setAuthMessage(err.message || 'Dang nhap that bai.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    if (!supabase) return;
    setAuthBusy(true);
    setAuthMessage('');
    try {
      const { error: authError } = await supabase.auth.signOut();
      if (authError) throw authError;
      setAuthMessage('Da dang xuat. Tien do cuc bo van duoc giu tren may nay.');
    } catch (err) {
      setAuthMessage(err.message || 'Dang xuat that bai.');
    } finally {
      setAuthBusy(false);
    }
  };

  return (
    <main className={`app-shell ${readerMode ? 'reader-focus' : ''} ${showLibrary ? 'library-open' : ''}`}>
      {showLibrary && <button className="mobile-backdrop" aria-label="Dong thu vien" onClick={() => setShowLibrary(false)} />}

      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon"><BookOpen size={22} /></div>
          <div>
            <h1>Drive EPUB Reader</h1>
            <p>Doc sach tu Google Drive</p>
          </div>
          <button className="sidebar-close" onClick={() => setShowLibrary(false)} aria-label="Dong thu vien"><X size={18} /></button>
        </div>

        <div className="search-box">
          <Search size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tim sach..." />
        </div>

        <button className="secondary-btn" onClick={loadBooks} disabled={loadingBooks}>
          <RefreshCw size={16} className={loadingBooks ? 'spin' : ''} /> Tai lai thu vien
        </button>

        <div className="auth-card">
          <div className="auth-title">
            <User size={16} />
            <strong>{user ? 'Tai khoan doc sach' : 'Dong bo tien do'}</strong>
          </div>

          {!isSupabaseConfigured ? (
            <p className="auth-note">Chua cau hinh Supabase. App van luu doc tiep tren may nay.</p>
          ) : user ? (
            <>
              <p className="auth-note">Dang nhap: <b>{user.email}</b></p>
              <button className="secondary-btn compact" onClick={handleSignOut} disabled={authBusy}>
                <LogOut size={15} /> Dang xuat
              </button>
            </>
          ) : (
            <form onSubmit={handleAuthSubmit} className="auth-form">
              <input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="Email" autoComplete="email" />
              <input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="Mat khau" autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'} />
              <button className="secondary-btn compact" type="submit" disabled={authBusy}>
                <LogIn size={15} /> {authBusy ? 'Dang xu ly...' : authMode === 'signup' ? 'Tao tai khoan' : 'Dang nhap'}
              </button>
              <button className="link-btn" type="button" onClick={() => setAuthMode((v) => v === 'signup' ? 'login' : 'signup')}>
                {authMode === 'signup' ? 'Da co tai khoan? Dang nhap' : 'Chua co tai khoan? Tao moi'}
              </button>
            </form>
          )}
          {authMessage && <p className="auth-message">{authMessage}</p>}
        </div>

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
                  {lastReadMap[book.id]?.chapter && <em>Doc tiep: {lastReadMap[book.id].chapter}{lastReadMap[book.id]?.source === 'cloud' ? ' - online' : ''}</em>}
                  {!lastReadMap[book.id]?.chapter && typeof lastReadMap[book.id]?.progress === 'number' && <em>Doc tiep: {lastReadMap[book.id].progress}%</em>}
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
          <div className="title-row">
            <button className="mobile-library-btn" onClick={() => setShowLibrary(true)} title="Thu vien" aria-label="Mo thu vien">
              <PanelLeft size={18} />
            </button>
            <div className="title-area">
              <span>{status}</span>
              <h2>{selectedBook ? cleanTitle(selectedBook.name) : 'Chon mot cuon sach'}</h2>
              <p>{currentChapter || 'Vuot trai/phai hoac bam 2 canh man hinh de chuyen trang'}</p>
            </div>
          </div>

          <div className="toolbar" aria-label="Cong cu doc sach">
            <button onClick={() => setShowToc((v) => !v)} title="Muc luc" aria-label="Muc luc"><ListTree size={18} /></button>
            <button onClick={() => setFontSize((v) => Math.max(70, v - 10))} aria-label="Giam co chu">A-</button>
            <button onClick={() => setFontSize((v) => Math.min(180, v + 10))} aria-label="Tang co chu">A+</button>
            <button onClick={() => setDarkMode((v) => !v)} title="Dark mode" aria-label="Dark mode">{darkMode ? <Sun size={18} /> : <Moon size={18} />}</button>
            <button onClick={() => setReaderMode((v) => !v)} title="Che do doc sach" aria-label="Che do doc sach">{readerMode ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>
            <button className="settings-pill" aria-label="Co chu hien tai"><Settings size={16} /> {fontSize}%</button>
          </div>
        </header>

        <div className="progress-wrap"><div style={{ width: `${progress}%` }} /></div>

        <div className="reader-wrap" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          <button className="nav-btn left" onClick={goPrev} aria-label="Trang truoc"><ChevronLeft size={30} /></button>
          <div className="epub-viewer" ref={viewerRef}>
            {!selectedBook && <div className="empty big">Hay mo thu vien va chon sach de doc.</div>}
            {loadingBook && <div className="loading-overlay">Dang mo sach...</div>}
          </div>
          <button className="nav-btn right" onClick={goNext} aria-label="Trang sau"><ChevronRight size={30} /></button>
        </div>
      </section>

      {showToc && (
        <div className="toc-drawer" role="dialog" aria-label="Muc luc">
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
