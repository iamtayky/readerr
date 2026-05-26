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
  return name?.replace(/\.epub$/i, '') || 'Không rõ tên sách';
}

function vietHoaLoi(error) {
  const raw = typeof error === 'string' ? error : error?.message || '';
  const lower = raw.toLowerCase();
  if (!raw) return 'Đã xảy ra lỗi. Vui lòng thử lại.';
  if (lower.includes('invalid api key')) return 'Khóa Supabase không hợp lệ. Hãy kiểm tra NEXT_PUBLIC_SUPABASE_ANON_KEY trên Vercel.';
  if (lower.includes('invalid login credentials')) return 'Email hoặc mật khẩu không đúng.';
  if (lower.includes('email not confirmed')) return 'Email chưa được xác nhận. Hãy mở hộp thư và bấm liên kết xác nhận.';
  if (lower.includes('user already registered')) return 'Email này đã có tài khoản. Hãy chuyển sang Đăng nhập.';
  if (lower.includes('password')) return 'Mật khẩu chưa hợp lệ. Hãy dùng mật khẩu dài hơn hoặc mạnh hơn.';
  if (lower.includes('failed to fetch')) return 'Không kết nối được máy chủ. Hãy kiểm tra mạng hoặc cấu hình Vercel.';
  if (lower.includes('jwt')) return 'Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại.';
  if (lower.includes('rate limit')) return 'Bạn thao tác quá nhanh. Hãy chờ một lúc rồi thử lại.';
  return raw;
}

function isAbortLike(error) {
  return error?.name === 'AbortError' || String(error?.message || '').toLowerCase().includes('aborted');
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
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
  const openTokenRef = useRef(0);
  const locationsTimerRef = useRef(null);
  const lastSavedCfiRef = useRef('');

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
  const [status, setStatus] = useState('Chưa mở sách');
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

    setLastReadMap(safeJsonParse(localStorage.getItem('reader.lastReadMap') || '{}', {}));
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
      setAuthMessage(`Không đồng bộ được tiến độ: ${vietHoaLoi(err)}`);
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
      const text = await response.text();
      const data = safeJsonParse(text || '{}', {});
      if (!response.ok) throw new Error(data.error || text || 'Không tải được danh sách sách');
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
    openTokenRef.current += 1;
    window.clearTimeout(saveTimerRef.current);
    window.clearTimeout(locationsTimerRef.current);
    lastSavedCfiRef.current = '';

    if (renditionRef.current) {
      try { renditionRef.current.destroy(); } catch (_) {}
      renditionRef.current = null;
    }
    if (bookRef.current) {
      try { bookRef.current.destroy(); } catch (_) {}
      bookRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    if (viewerRef.current) viewerRef.current.innerHTML = '';
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
          if (cloudError) setAuthMessage(`Không lưu được tiến độ trực tuyến: ${vietHoaLoi(cloudError)}`);
        });
    }
  }, []);

  const getLocalReadingPoint = useCallback((bookId) => {
    if (!bookId) return null;

    const full = safeJsonParse(localStorage.getItem(`reader.lastRead.${bookId}`) || 'null', null);
    if (full?.cfi || full?.href) return full;

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
      setAuthMessage(`Không lấy được tiến độ online: ${err.message}`);
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
        // Có file EPUB chưa tạo xong locations. Vẫn lưu CFI để đọc tiếp.
      }
    }

    const chapter = tocRef.current.find((item) => item.href && href && href.includes(item.href.split('#')[0]));
    const chapterLabel = chapter?.label?.trim() || currentChapter || '';
    if (chapterLabel) setCurrentChapter(chapterLabel);

    if (bookMeta?.id && cfi && cfi !== lastSavedCfiRef.current) {
      lastSavedCfiRef.current = cfi;
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
      }, 650);
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
      // Bỏ qua URL không hợp lệ.
    }

    try {
      add(decodeURIComponent(raw));
    } catch (_) {
      // Bỏ qua href không decode được.
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
    if (!target) throw new Error('Không tìm thấy liên kết trong EPUB');

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
          // Thử ứng viên tiếp theo.
        }
      }
      throw firstError || new Error('Không chuyển được chương');
    }
  }, [findSpineTarget, makeInternalCandidates]);

  const openBook = useCallback(async (bookMeta) => {
    if (!bookMeta) return;
    const openToken = openTokenRef.current + 1;
    openTokenRef.current = openToken;

    setSelectedBook(bookMeta);
    setShowLibrary(false);
    setLoadingBook(true);
    setStatus('Đang tải file EPUB...');
    setToc([]);
    setProgress(0);
    setCurrentChapter('');
    setError('');

    const ensureActive = () => openTokenRef.current === openToken;

    try {
      destroyCurrentBook();
      openTokenRef.current = openToken;

      const response = await fetch(`/api/book/${bookMeta.id}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(await response.text());
      if (!ensureActive()) return;

      const arrayBuffer = await response.arrayBuffer();
      if (!ensureActive()) return;

      const { default: ePub } = await import('epubjs');
      if (!ensureActive()) return;

      const book = ePub(arrayBuffer);
      bookRef.current = book;

      setStatus('Đang mở khung đọc...');
      const rendition = book.renderTo(viewerRef.current, {
        width: '100%',
        height: '100%',
        spread: 'none',
        flow: 'paginated',
        allowScriptedContent: false,
        manager: 'default',
      });
      renditionRef.current = rendition;

      const handleInternalLink = (href) => {
        if (!href || !ensureActive()) return;
        setStatus('Đang chuyển chương...');
        displayTarget(href).catch((err) => {
          if (!ensureActive()) return;
          setError(err.message || 'Không chuyển được chương');
          setStatus('Lỗi khi chuyển chương');
        });
      };

      rendition.on('linkClicked', handleInternalLink);

      rendition.hooks.content.register((contents) => {
        const doc = contents?.document;
        if (!doc) return;

        doc.documentElement.style.scrollBehavior = 'auto';
        doc.body?.style?.setProperty('-webkit-font-smoothing', 'antialiased');
        doc.body?.style?.setProperty('text-rendering', 'optimizeLegibility');

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

      const commonTheme = {
        body: {
          'font-family': 'Garamond, "Times New Roman", Times, serif',
          'line-height': '1.82',
          'padding': '0 2px',
          'text-rendering': 'optimizeLegibility',
          '-webkit-font-smoothing': 'antialiased',
        },
        p: { 'margin-bottom': '0.92em' },
        a: { cursor: 'pointer', 'touch-action': 'manipulation' },
        img: { 'max-width': '100%', height: 'auto' },
      };

      rendition.themes.register('light', {
        ...commonTheme,
        body: { ...commonTheme.body, color: '#1f2937', background: '#fffaf2' },
        a: { ...commonTheme.a, color: '#7c3aed' },
      });
      rendition.themes.register('dark', {
        ...commonTheme,
        body: { ...commonTheme.body, color: '#e5e7eb', background: '#111827' },
        a: { ...commonTheme.a, color: '#a78bfa' },
      });
      rendition.themes.select(darkMode ? 'dark' : 'light');
      rendition.themes.fontSize(`${fontSize}%`);

      rendition.on('relocated', (location) => {
        if (ensureActive()) updateProgress(location);
      });
      rendition.on('rendered', () => {
        if (ensureActive()) setStatus('Đang đọc');
      });
      rendition.on('displayed', () => {
        if (ensureActive()) setLoadingBook(false);
      });

      setStatus('Đang hiển thị trang đầu...');
      const saved = await getSavedReadingPoint(bookMeta.id);
      if (!ensureActive()) return;
      if (saved?.chapter) setCurrentChapter(saved.chapter);
      if (typeof saved?.progress === 'number') setProgress(saved.progress);

      try {
        await rendition.display(saved?.cfi || saved?.href || undefined);
      } catch (_) {
        await rendition.display(saved?.href || undefined);
      }
      if (!ensureActive()) return;

      book.loaded.navigation
        .then((navigation) => {
          if (!ensureActive()) return;
          tocRef.current = navigation?.toc || [];
          setToc(tocRef.current);
        })
        .catch(() => {
          if (!ensureActive()) return;
          tocRef.current = [];
          setToc([]);
        });

      const generateLocations = () => {
        if (!ensureActive() || !bookRef.current?.locations) return;
        book.locations.generate(180).catch(() => null);
      };

      if ('requestIdleCallback' in window) {
        const idleId = window.requestIdleCallback(generateLocations, { timeout: 2500 });
        locationsTimerRef.current = window.setTimeout(() => window.cancelIdleCallback?.(idleId), 4000);
      } else {
        locationsTimerRef.current = window.setTimeout(generateLocations, 1200);
      }
    } catch (err) {
      if (!isAbortLike(err) && ensureActive()) {
        setError(err.message || 'Không mở được sách');
        setStatus('Lỗi khi mở sách');
      }
    } finally {
      if (ensureActive()) setLoadingBook(false);
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
    const rendition = renditionRef.current;
    if (!rendition) return;
    setStatus('Đang chuyển trang...');
    try {
      await rendition.next();
    } catch (err) {
      setError(err.message || 'Không chuyển được trang sau');
      setStatus('Lỗi khi chuyển trang');
    }
  }, []);

  const goPrev = useCallback(async () => {
    const rendition = renditionRef.current;
    if (!rendition) return;
    setStatus('Đang chuyển trang...');
    try {
      await rendition.prev();
    } catch (err) {
      setError(err.message || 'Không chuyển được trang trước');
      setStatus('Lỗi khi chuyển trang');
    }
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
    setStatus('Đang chuyển chương...');
    try {
      await displayTarget(href);
    } catch (err) {
      setError(err.message || 'Không chuyển được chương');
      setStatus('Lỗi khi chuyển chương');
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
      setAuthMessage('Chưa cấu hình Supabase trên Vercel.');
      return;
    }
    if (!authEmail || !authPassword) {
      setAuthMessage('Nhập email và mật khẩu.');
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
        setAuthMessage('Đã tạo tài khoản. Hãy kiểm tra email để xác nhận nếu Supabase yêu cầu.');
      } else {
        setAuthMessage('Đã đăng nhập và đang đồng bộ tiến độ đọc.');
      }
    } catch (err) {
      setAuthMessage(vietHoaLoi(err) || 'Đăng nhập thất bại.');
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
      setAuthMessage('Đã đăng xuất. Tiến độ cục bộ vẫn được giữ trên máy này.');
    } catch (err) {
      setAuthMessage(vietHoaLoi(err) || 'Đăng xuất thất bại.');
    } finally {
      setAuthBusy(false);
    }
  };

  return (
    <main className={`app-shell ${readerMode ? 'reader-focus' : ''} ${showLibrary ? 'library-open' : ''}`}>
      {showLibrary && <button className="mobile-backdrop" aria-label="Đóng thư viện" onClick={() => setShowLibrary(false)} />}

      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon"><BookOpen size={22} /></div>
          <div>
            <h1>Tủ sách cá nhân</h1>
            <p>Đọc EPUB từ Google Drive</p>
          </div>
          <button className="sidebar-close" onClick={() => setShowLibrary(false)} aria-label="Đóng thư viện"><X size={18} /></button>
        </div>

        <div className="search-box">
          <Search size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm tên sách..." />
        </div>

        <button className="secondary-btn" onClick={loadBooks} disabled={loadingBooks}>
          <RefreshCw size={16} className={loadingBooks ? 'spin' : ''} /> Làm mới danh sách
        </button>

        <div className="auth-card">
          <div className="auth-title">
            <User size={16} />
            <strong>{user ? 'Tài khoản đọc sách' : 'Đăng nhập để đồng bộ'}</strong>
          </div>

          {!isSupabaseConfigured ? (
            <p className="auth-note">Chưa cấu hình Supabase. Bạn vẫn có thể đọc tiếp trên thiết bị này.</p>
          ) : user ? (
            <>
              <p className="auth-note">Tài khoản hiện tại: <b>{user.email}</b></p>
              <button className="secondary-btn compact" onClick={handleSignOut} disabled={authBusy}>
                <LogOut size={15} /> Đăng xuất
              </button>
            </>
          ) : (
            <form onSubmit={handleAuthSubmit} className="auth-form">
              <input type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="Email đăng nhập" autoComplete="email" />
              <input type="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="Mật khẩu" autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'} />
              <button className="secondary-btn compact" type="submit" disabled={authBusy}>
                <LogIn size={15} /> {authBusy ? 'Đang xử lý...' : authMode === 'signup' ? 'Tạo tài khoản' : 'Đăng nhập'}
              </button>
              <button className="link-btn" type="button" onClick={() => setAuthMode((v) => v === 'signup' ? 'login' : 'signup')}>
                {authMode === 'signup' ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký ngay'}
              </button>
            </form>
          )}
          {authMessage && <p className="auth-message">{authMessage}</p>}
        </div>

        {error && <div className="error-box">{error}</div>}

        <div className="book-list">
          {loadingBooks ? (
            <div className="empty">Đang tải danh sách sách từ Google Drive...</div>
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
                  {lastReadMap[book.id]?.chapter && <em>Đọc tiếp: {lastReadMap[book.id].chapter}{lastReadMap[book.id]?.source === 'cloud' ? ' · đã đồng bộ' : ''}</em>}
                  {!lastReadMap[book.id]?.chapter && typeof lastReadMap[book.id]?.progress === 'number' && <em>Đọc tiếp: {lastReadMap[book.id].progress}%</em>}
                </div>
              </button>
            ))
          ) : (
            <div className="empty">Chưa tìm thấy file EPUB trong thư mục Google Drive.</div>
          )}
        </div>
      </aside>

      <section className="reader-panel">
        <header className="topbar">
          <div className="title-row">
            <button className="mobile-library-btn" onClick={() => setShowLibrary(true)} title="Thư viện" aria-label="Mở thư viện">
              <PanelLeft size={18} />
            </button>
            <div className="title-area">
              <span>{status}</span>
              <h2>{selectedBook ? cleanTitle(selectedBook.name) : 'Chọn sách để bắt đầu đọc'}</h2>
              <p>{currentChapter || 'Vuốt trái/phải hoặc chạm hai cạnh màn hình để chuyển trang'}</p>
            </div>
          </div>

          <div className="toolbar" aria-label="Công cụ đọc sách">
            <button onClick={() => setShowToc((v) => !v)} title="Mục lục" aria-label="Mục lục"><ListTree size={18} /></button>
            <button onClick={() => setFontSize((v) => Math.max(70, v - 10))} aria-label="Giảm cỡ chữ">A-</button>
            <button onClick={() => setFontSize((v) => Math.min(180, v + 10))} aria-label="Tăng cỡ chữ">A+</button>
            <button onClick={() => setDarkMode((v) => !v)} title="Đổi giao diện sáng/tối" aria-label="Đổi giao diện sáng/tối">{darkMode ? <Sun size={18} /> : <Moon size={18} />}</button>
            <button onClick={() => setReaderMode((v) => !v)} title="Chế độ đọc tập trung" aria-label="Chế độ đọc tập trung">{readerMode ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</button>
            <button className="settings-pill" aria-label="Cỡ chữ hiện tại"><Settings size={16} /> {fontSize}%</button>
          </div>
        </header>

        <div className="progress-wrap"><div style={{ width: `${progress}%` }} /></div>

        <div className="reader-wrap" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
          <button className="nav-btn left" onClick={goPrev} aria-label="Trang trước"><ChevronLeft size={30} /></button>
          <div className="epub-viewer" ref={viewerRef}>
            {!selectedBook && <div className="empty big">Mở tủ sách và chọn một cuốn để đọc.</div>}
            {loadingBook && <div className="loading-overlay">Đang mở sách...</div>}
          </div>
          <button className="nav-btn right" onClick={goNext} aria-label="Trang sau"><ChevronRight size={30} /></button>
        </div>
      </section>

      {showToc && (
        <div className="toc-drawer" role="dialog" aria-label="Mục lục">
          <div className="toc-header">
            <strong>Mục lục</strong>
            <button onClick={() => setShowToc(false)}>Đóng</button>
          </div>
          <div className="toc-list">
            {toc.length ? toc.map((item, index) => (
              <button key={`${item.href}-${index}`} onClick={() => jumpTo(item.href)}>
                {item.label?.trim() || `Chương ${index + 1}`}
              </button>
            )) : <p>Sách này không có mục lục rõ ràng.</p>}
          </div>
        </div>
      )}
    </main>
  );
}
