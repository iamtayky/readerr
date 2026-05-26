# Drive EPUB Reader - Vercel

Website doc sach EPUB bang Next.js, chay truc tiep tren Vercel. Project da co san mot file mau trong `public/books` de deploy len la xem duoc ngay. Khi muon doc sach tu Google Drive, ban chi can dat bien moi truong tren Vercel.

## Tinh nang

- Doc file `.epub` tu Google Drive folder hoac tu `public/books`.
- Dark mode / light mode.
- Che do doc sach toan man hinh, an thu vien.
- Chuyen trang/chuyen chuong bang nut, phim mui ten trai/phai, muc luc EPUB.
- Luu vi tri doc rieng cho tung sach bang `localStorage`.
- Chinh co chu.
- API route server-side, khong de lo API key ra trinh duyet.

## Cach deploy nhanh nhat tren Vercel

1. Giai nen file ZIP nay.
2. Vao https://vercel.com/new va import/upload project.
3. Framework: Vercel se nhan la Next.js.
4. Bam Deploy. Neu chua cau hinh Google Drive, website van doc file mau trong `public/books`.

## Cach ket noi Google Drive folder

### Cach A - de nhat: folder public link

1. Tao folder tren Google Drive.
2. Upload cac file `.epub` vao folder do.
3. Chia se folder: `Anyone with the link` -> `Viewer`.
4. Lay Folder ID tu URL. Vi du URL:

```txt
https://drive.google.com/drive/folders/1AbCDefGhijkLmNoP
```

Folder ID la:

```txt
1AbCDefGhijkLmNoP
```

5. Tao Google Cloud API key, bat Google Drive API.
6. Tren Vercel -> Project -> Settings -> Environment Variables, them:

```txt
GOOGLE_DRIVE_FOLDER_ID=folder_id_cua_ban
GOOGLE_API_KEY=api_key_cua_ban
```

7. Redeploy project.

### Cach B - folder private: service account

Dung cach nay neu khong muon folder public.

1. Tao Service Account trong Google Cloud.
2. Bat Google Drive API.
3. Tao key JSON cho service account.
4. Chia se folder Drive cho email service account, quyen `Viewer`.
5. Tren Vercel -> Project -> Settings -> Environment Variables, them:

```txt
GOOGLE_DRIVE_FOLDER_ID=folder_id_cua_ban
GOOGLE_SERVICE_ACCOUNT_EMAIL=ten-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Luu y: private key phai giu nguyen cac ky tu `\n`. Khong dat cac bien nay voi tien to `NEXT_PUBLIC_`.

## Them sach truc tiep vao ma nguon

Neu khong dung Google Drive, ban co the bo file `.epub` vao:

```txt
public/books/
```

Sau do deploy lai. Cach nay don gian nhat nhung moi lan them sach phai redeploy.

## Chay thu tren may tinh, neu can

```bash
npm install
npm run dev
```

Mo `http://localhost:3000`.

## Cau truc chinh

```txt
app/api/books/route.js        Lay danh sach sach tu Drive + public/books
app/api/book/[id]/route.js    Stream/tai file EPUB
components/ReaderApp.jsx      Giao dien doc sach
lib/googleDrive.js            Ket noi Google Drive API
lib/localBooks.js             Doc file trong public/books
```
