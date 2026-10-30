// Off-site copy of the weekly backup to Google Drive, with the same service account as the
// Sheets copy. Service accounts have no storage of their own, so the target folder must be in
// a Google Workspace shared drive where the service account is a member (Content manager).
// DRIVE_BACKUP_FOLDER_ID = that folder's ID. Files are uploaded, never read or deleted here.

import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { googleToken } from './sheets.js';

const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,size';

/** Uploads one file into the folder. `fetchImpl` and `tokenImpl` are for tests. */
export async function uploadToDrive({ credentials, folderId, file, fetchImpl = fetch, tokenImpl = googleToken }) {
  if (!folderId) throw new Error('drive: folderId is required');
  const { access_token: token } = await tokenImpl(credentials, 'https://www.googleapis.com/auth/drive.file');
  const boundary = `cs${Date.now().toString(36)}`;
  const meta = JSON.stringify({ name: basename(file), parents: [folderId], mimeType: 'application/gzip' });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/gzip\r\n\r\n`),
    readFileSync(file),
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const res = await fetchImpl(UPLOAD, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
  if (!res.ok) throw new Error(`Drive upload ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}
