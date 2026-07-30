import {
  assertSameOrigin,
  ensureFreshAccessToken,
  getSession,
  json,
  makeSessionCookie
} from "../_lib/auth.js";

const FOLDER_MIME = "application/vnd.google-apps.folder";

function validateDriveId(value, label) {
  const id = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(id)) {
    throw Object.assign(new Error(`${label} tidak valid.`), { status: 400 });
  }
  return id;
}

function validateOutputName(value) {
  const name = String(value || "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  if (!name) throw Object.assign(new Error("Nama file output wajib diisi."), { status: 400 });
  if (name.length > 200) throw Object.assign(new Error("Nama file output maksimal 200 karakter."), { status: 400 });
  return name;
}

async function parseJson(request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 20_000) throw Object.assign(new Error("Request terlalu besar."), { status: 413 });
  try {
    return await request.json();
  } catch {
    throw Object.assign(new Error("Body JSON tidak valid."), { status: 400 });
  }
}

async function googleDriveFetch(path, accessToken, options = {}) {
  const response = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `Google Drive API gagal (${response.status}).`;
    const error = new Error(message);
    error.status = response.status === 403 ? 403 : response.status === 404 ? 404 : 502;
    throw error;
  }
  return payload;
}

export default {
  async fetch(request) {
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, { Allow: "POST" });

    try {
      assertSameOrigin(request);
      let session = getSession(request);
      if (!session) return json({ error: "Sesi login tidak valid. Silakan login ulang." }, 401);

      const body = await parseJson(request);
      const sourceId = validateDriveId(body.sourceId, "ID file sumber");
      const folderId = validateDriveId(body.folderId, "ID folder tujuan");
      const outputName = validateOutputName(body.outputName);

      const fresh = await ensureFreshAccessToken(session);
      session = fresh.session;
      const accessToken = session.accessToken;

      const source = await googleDriveFetch(
        `/files/${encodeURIComponent(sourceId)}?supportsAllDrives=true&fields=id,name,mimeType,trashed,capabilities(canCopy)`,
        accessToken
      );
      if (source.trashed) throw Object.assign(new Error("File sumber berada di Trash."), { status: 400 });
      if (source.mimeType === FOLDER_MIME) throw Object.assign(new Error("Sumber harus berupa file, bukan folder."), { status: 400 });
      if (source.capabilities?.canCopy === false) throw Object.assign(new Error("Akun ini tidak diizinkan menyalin file sumber."), { status: 403 });

      const folder = await googleDriveFetch(
        `/files/${encodeURIComponent(folderId)}?supportsAllDrives=true&fields=id,name,mimeType,trashed,capabilities(canAddChildren)`,
        accessToken
      );
      if (folder.trashed) throw Object.assign(new Error("Folder tujuan berada di Trash."), { status: 400 });
      if (folder.mimeType !== FOLDER_MIME) throw Object.assign(new Error("Tujuan bukan folder Google Drive."), { status: 400 });
      if (folder.capabilities?.canAddChildren === false) {
        throw Object.assign(new Error("Akun ini tidak diizinkan menambahkan file ke folder tujuan."), { status: 403 });
      }

      const copiedFile = await googleDriveFetch(
        `/files/${encodeURIComponent(sourceId)}/copy?supportsAllDrives=true&fields=id,name,mimeType,webViewLink`,
        accessToken,
        {
          method: "POST",
          body: JSON.stringify({ name: outputName, parents: [folderId] })
        }
      );

      const headers = fresh.changed ? { "Set-Cookie": makeSessionCookie(session) } : {};
      return json({
        ok: true,
        file: {
          id: copiedFile.id,
          name: copiedFile.name,
          mimeType: copiedFile.mimeType,
          webViewLink: copiedFile.webViewLink || `https://drive.google.com/open?id=${copiedFile.id}`
        },
        folder: { id: folder.id, name: folder.name }
      }, 200, headers);
    } catch (error) {
      console.error("Drive copy error:", error);
      return json({ error: error.message || "File gagal disalin." }, error.status || 500);
    }
  }
};
