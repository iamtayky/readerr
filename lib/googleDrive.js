import { GoogleAuth } from 'google-auth-library';

const DRIVE_BASE = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

function getEnv(name) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : '';
}

function normalizePrivateKey(key) {
  return key.replace(/\\n/g, '\n');
}

export function getDriveConfig() {
  const folderId = getEnv('GOOGLE_DRIVE_FOLDER_ID');
  if (!folderId) throw new Error('Missing GOOGLE_DRIVE_FOLDER_ID');

  const apiKey = getEnv('GOOGLE_API_KEY');
  const clientEmail = getEnv('GOOGLE_SERVICE_ACCOUNT_EMAIL');
  const privateKey = getEnv('GOOGLE_PRIVATE_KEY');

  return { folderId, apiKey, clientEmail, privateKey };
}

export async function getAuthHeader() {
  const { clientEmail, privateKey } = getDriveConfig();
  if (!clientEmail || !privateKey) return {};

  const auth = new GoogleAuth({
    credentials: {
      client_email: clientEmail,
      private_key: normalizePrivateKey(privateKey),
    },
    scopes: [DRIVE_SCOPE],
  });

  const client = await auth.getClient();
  const headers = await client.getRequestHeaders();
  return { Authorization: headers.Authorization || headers.authorization };
}

export function withApiKey(url) {
  const { apiKey } = getDriveConfig();
  if (!apiKey) return url;
  url.searchParams.set('key', apiKey);
  return url;
}

export async function driveFetch(url, init = {}) {
  const authHeader = await getAuthHeader();
  const hasBearer = Boolean(authHeader.Authorization);
  const requestUrl = hasBearer ? url : withApiKey(url);

  const response = await fetch(requestUrl, {
    ...init,
    headers: {
      ...(init.headers || {}),
      ...authHeader,
    },
    cache: 'no-store',
  });

  return response;
}

export async function listEpubFiles() {
  const { folderId } = getDriveConfig();
  const q = [`'${folderId.replace(/'/g, "\\'")}' in parents`, 'trashed = false', "(mimeType = 'application/epub+zip' or name contains '.epub')"].join(' and ');

  const url = new URL(DRIVE_BASE);
  url.searchParams.set('q', q);
  url.searchParams.set('fields', 'files(id,name,mimeType,size,modifiedTime,thumbnailLink,webViewLink)');
  url.searchParams.set('orderBy', 'name_natural');
  url.searchParams.set('pageSize', '1000');
  url.searchParams.set('supportsAllDrives', 'true');
  url.searchParams.set('includeItemsFromAllDrives', 'true');

  const response = await driveFetch(url);
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Google Drive list failed: ${response.status} ${detail}`);
  }

  const data = await response.json();
  return (data.files || []).map((file) => ({
    id: file.id,
    name: file.name,
    size: file.size ? Number(file.size) : null,
    modifiedTime: file.modifiedTime,
    thumbnailLink: file.thumbnailLink || null,
    webViewLink: file.webViewLink || null,
  }));
}

export async function fetchDriveFile(fileId, rangeHeader) {
  const url = new URL(`${DRIVE_BASE}/${encodeURIComponent(fileId)}`);
  url.searchParams.set('alt', 'media');
  url.searchParams.set('supportsAllDrives', 'true');

  return driveFetch(url, {
    headers: rangeHeader ? { Range: rangeHeader } : {},
  });
}
