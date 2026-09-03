const $ = id => document.getElementById(id);


const state = {
  pdfBytes: null,
  pdfPages: 0,
  qrZip: null,
  driveQrZip: null,
  pasteMode: null,
  driveUser: null,
  allowedGoogleEmail: "bemfteicits2603@gmail.com"
};

let logoPromise = null;

// -----------------------------------------------------------------------------
// Navigasi dan helper umum
// -----------------------------------------------------------------------------

document.querySelectorAll(".nav").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".nav").forEach(item => item.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(item => item.classList.remove("active"));
    button.classList.add("active");
    $("panel-" + button.dataset.panel).classList.add("active");
  });
});

function status(id, text, type = "") {
  const element = $(id);
  element.textContent = text;
  element.className = `status ${type}`;
}

function esc(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function safeName(value, fallback = "file") {
  return (value || fallback)
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, " ")
    .trim() || fallback;
}

function normalizeNamePart(value, label) {
  const cleaned = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/[^A-Z0-9_-]/g, "");

  if (!cleaned) throw new Error(`${label} wajib diisi.`);
  return cleaned;
}

function readNumberRange(startValue, endValue, label = "Nomor surat") {
  const startRaw = String(startValue || "").trim();
  const endRaw = String(endValue || "").trim();

  if (!/^\d+$/.test(startRaw) || !/^\d+$/.test(endRaw)) {
    throw new Error(`${label} awal dan akhir harus berupa angka.`);
  }

  const start = Number(startRaw);
  const end = Number(endRaw);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end) {
    throw new Error(`${label} tidak valid. Nomor akhir harus sama atau lebih besar dari nomor awal.`);
  }

  const count = end - start + 1;
  if (count > 250) {
    throw new Error(`Maksimal 250 output dalam sekali generate. Range saat ini menghasilkan ${count} output.`);
  }

  return {
    start,
    end,
    count,
    width: Math.max(startRaw.length, endRaw.length)
  };
}

function formatSequenceNumber(number, width) {
  return String(number).padStart(width, "0");
}

function buildDocumentName(numberText, letterType, department) {
  return `${numberText}_${normalizeNamePart(letterType, "Jenis surat")}_${normalizeNamePart(department, "Sumber / departemen")}`;
}

function parseCustomPageExpressions(value) {
  return String(value || "")
    .split(/(?:;|\r?\n)+/)
    .map(item => item.trim())
    .filter(Boolean);
}

function validatePageExpressionSyntax(expression, label = "Format halaman") {
  const value = String(expression || "").trim();
  if (!value) throw new Error(`${label} kosong.`);

  for (const rawPart of value.split(",")) {
    const part = rawPart.trim();
    if (/^\d+$/.test(part)) continue;
    const rangeMatch = part.match(/^(\d+)-(\d+)$/);
    if (rangeMatch && Number(rangeMatch[1]) <= Number(rangeMatch[2])) continue;
    throw new Error(`${label} tidak valid: ${part || value}`);
  }
  return value;
}

function withFixedPages(baseExpression, fixedPages) {
  const extra = String(fixedPages || "").trim().replace(/^,+|,+$/g, "");
  if (extra) validatePageExpressionSyntax(extra, "Halaman tambahan tetap");
  return extra ? `${baseExpression},${extra}` : baseExpression;
}

function driveRowsAreBlank() {
  const rows = [...document.querySelectorAll(".drive-row")];
  return rows.length === 0 || rows.every(row =>
    !row.querySelector(".drive-source").value.trim() &&
    !row.querySelector(".drive-name").value.trim() &&
    !row.querySelector(".drive-folder").value.trim()
  );
}

function validateUrl(value, label) {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) throw new Error();
    return url;
  } catch {
    throw new Error(`${label} tidak valid.`);
  }
}

function extractDriveId(value, label = "Link Google Drive") {
  const input = String(value || "").trim();
  const patterns = [
    /\/d\/([a-zA-Z0-9_-]{10,})/,
    /\/folders\/([a-zA-Z0-9_-]{10,})/,
    /[?&]id=([a-zA-Z0-9_-]{10,})/,
    /^([a-zA-Z0-9_-]{10,})$/
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) return match[1];
  }

  throw new Error(`${label} tidak valid atau ID tidak ditemukan.`);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Logo gagal dimuat."));
    image.src = src;
  });
}

function getLogo() {
  if (!logoPromise) logoPromise = loadImage("assets/logo-bem-fteic.jpeg");
  return logoPromise;
}

function canvasBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error("PNG gagal dibuat.")),
      "image/png"
    );
  });
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function assertQrLibraries() {
  const missing = [];
  if (typeof QRCode === "undefined") missing.push("QR Code");
  if (typeof JSZip === "undefined") missing.push("ZIP");
  if (missing.length) {
    throw new Error(`Library ${missing.join(", ")} gagal dimuat. Pastikan internet aktif saat membuka aplikasi.`);
  }
}

function assertPdfLibraries() {
  const missing = [];
  if (typeof PDFLib === "undefined") missing.push("PDF");
  if (typeof JSZip === "undefined") missing.push("ZIP");
  if (missing.length) {
    throw new Error(`Library ${missing.join(", ")} gagal dimuat. Pastikan internet aktif saat membuka aplikasi.`);
  }
}

async function createBrandedQrBlob(link, size, logoRatio) {
  assertQrLibraries();

  const holder = document.createElement("div");
  holder.style.position = "fixed";
  holder.style.left = "-10000px";
  holder.style.top = "-10000px";
  document.body.appendChild(holder);

  try {
    new QRCode(holder, {
      text: link,
      width: size,
      height: size,
      correctLevel: QRCode.CorrectLevel.H,
      colorDark: "#111111",
      colorLight: "#ffffff"
    });

    await wait(50);
    const source = holder.querySelector("canvas") || holder.querySelector("img");
    if (!source) throw new Error("QR gagal dibuat.");

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(source, 0, 0, size, size);

    const logo = await getLogo();
    const logoSize = Math.round(size * logoRatio);
    const padding = Math.round(logoSize * 0.12);
    const plateSize = logoSize + padding * 2;
    const plateX = (size - plateSize) / 2;
    const plateY = (size - plateSize) / 2;

    roundRect(ctx, plateX, plateY, plateSize, plateSize, Math.round(plateSize * 0.16));
    ctx.fillStyle = "#ffffff";
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, logoSize / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(
      logo,
      (size - logoSize) / 2,
      (size - logoSize) / 2,
      logoSize,
      logoSize
    );
    ctx.restore();

    return canvasBlob(canvas);
  } finally {
    holder.remove();
  }
}

// -----------------------------------------------------------------------------
// Fitur 01: Bulk QR
// -----------------------------------------------------------------------------

function addQrRow(name = "", link = "") {
  const row = document.createElement("div");
  row.className = "qr-row";
  row.innerHTML = `
    <input class="qr-name" placeholder="001_SPP_DAGRI" value="${esc(name)}">
    <input class="qr-link" placeholder="https://drive.google.com/file/d/..." value="${esc(link)}">
    <button class="remove" title="Hapus">×</button>
  `;
  row.querySelector(".remove").onclick = () => row.remove();
  $("qrRows").appendChild(row);
}

$("addQr").onclick = () => addQrRow();
$("clearQr").onclick = () => {
  $("qrRows").innerHTML = "";
  addQrRow();
};

$("generateQr").onclick = async () => {
  try {
    assertQrLibraries();

    const items = [...document.querySelectorAll(".qr-row")]
      .map(row => ({
        name: row.querySelector(".qr-name").value.trim(),
        link: row.querySelector(".qr-link").value.trim()
      }))
      .filter(item => item.name || item.link);

    if (!items.length) throw new Error("Belum ada data QR.");
    items.forEach((item, index) => {
      if (!item.name || !item.link) throw new Error(`Baris QR ${index + 1} belum lengkap.`);
      validateUrl(item.link, `Link pada baris ${index + 1}`);
    });

    status("qrStatus", "Sedang membuat QR...");
    $("qrResults").innerHTML = "";
    $("downloadQrZip").classList.add("hidden");

    const zip = new JSZip();
    const size = Number($("qrSize").value);
    const logoRatio = Number($("logoSize").value);

    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      const filename = safeName(item.name, `QR-${index + 1}`);
      const blob = await createBrandedQrBlob(item.link, size, logoRatio);
      zip.file(filename + ".png", blob);

      const url = URL.createObjectURL(blob);
      const card = document.createElement("div");
      card.className = "qr-card";
      card.innerHTML = `
        <div class="qr-preview"><img src="${url}" alt="${esc(filename)}"></div>
        <strong title="${esc(filename)}">${esc(filename)}</strong>
        <a class="btn secondary" href="${url}" download="${esc(filename)}.png">Download PNG</a>
      `;
      $("qrResults").appendChild(card);
    }

    state.qrZip = await zip.generateAsync({ type: "blob" });
    $("downloadQrZip").classList.remove("hidden");
    status("qrStatus", `${items.length} QR berhasil dibuat. Tes scan sebelum dipakai.`, "success");
  } catch (error) {
    console.error(error);
    status("qrStatus", error.message, "error");
  }
};

$("downloadQrZip").onclick = () => {
  if (state.qrZip) downloadBlob(state.qrZip, "BULK-QR-BEM-FTEIC.zip");
};

// -----------------------------------------------------------------------------
// Fitur 02: PDF Splitter
// -----------------------------------------------------------------------------

function addOutputRow(pages = "", name = "") {
  const row = document.createElement("div");
  row.className = "output-row";
  row.innerHTML = `
    <input class="out-pages" placeholder="1 atau 1-2" value="${esc(pages)}">
    <input class="out-name" placeholder="001_SPP_DAGRI" value="${esc(name)}">
    <button class="remove" title="Hapus">×</button>
  `;
  row.querySelector(".remove").onclick = () => row.remove();
  $("outputRows").appendChild(row);
}

$("addOutput").onclick = () => addOutputRow();
$("clearOutputs").onclick = () => {
  $("outputRows").innerHTML = "";
  addOutputRow();
};

function updateSplitGeneratorMode() {
  const custom = $("splitPageMode").value === "custom";
  $("splitCustomPagesWrap").classList.toggle("hidden", !custom);
  $("splitStartPageWrap").classList.toggle("hidden", custom);
  $("splitFixedPagesWrap").classList.toggle("hidden", custom);
  updateSplitBulkPreview();
}

function getSplitBulkPlan() {
  const range = readNumberRange($("splitStartNumber").value, $("splitEndNumber").value);
  const letterType = normalizeNamePart($("splitLetterType").value, "Jenis surat");
  const department = normalizeNamePart($("splitDepartment").value, "Sumber / departemen");
  const names = Array.from({ length: range.count }, (_, index) => {
    const numberText = formatSequenceNumber(range.start + index, range.width);
    return buildDocumentName(numberText, letterType, department);
  });

  let pages = [];
  const mode = $("splitPageMode").value;

  if (mode === "custom") {
    pages = parseCustomPageExpressions($("splitCustomPages").value);
    pages.forEach((expression, index) => validatePageExpressionSyntax(expression, `Pola custom ${index + 1}`));
    if (pages.length !== range.count) {
      throw new Error(`Range nomor menghasilkan ${range.count} surat, tetapi daftar halaman custom berisi ${pages.length} pola.`);
    }
  } else {
    const pagesPerOutput = Number(mode);
    const startPage = Number($("splitStartPage").value);
    if (!Number.isInteger(startPage) || startPage < 1) throw new Error("Halaman awal harus angka minimal 1.");
    const fixedPages = $("splitFixedPages").value.trim();

    pages = Array.from({ length: range.count }, (_, index) => {
      const first = startPage + index * pagesPerOutput;
      const last = first + pagesPerOutput - 1;
      const base = pagesPerOutput === 1 ? String(first) : `${first}-${last}`;
      return withFixedPages(base, fixedPages);
    });
  }

  return { range, names, pages, letterType, department };
}

function updateSplitBulkPreview() {
  const preview = $("splitBulkPreview");
  try {
    const plan = getSplitBulkPlan();
    const first = `${plan.pages[0]} → ${plan.names[0]}`;
    const last = plan.range.count > 1 ? `${plan.pages.at(-1)} → ${plan.names.at(-1)}` : "";
    preview.innerHTML = `<b>${plan.range.count} output</b> akan dibuat. <span>${esc(first)}${last ? ` &nbsp;…&nbsp; ${esc(last)}` : ""}</span>`;
    preview.classList.remove("preview-error");
  } catch (error) {
    preview.textContent = error.message;
    preview.classList.add("preview-error");
  }
}

$("splitPageMode").onchange = updateSplitGeneratorMode;
[
  "splitStartNumber", "splitEndNumber", "splitLetterType", "splitDepartment",
  "splitStartPage", "splitFixedPages", "splitCustomPages"
].forEach(id => $(id).addEventListener("input", updateSplitBulkPreview));

$("generateSplitBulk").onclick = () => {
  try {
    const plan = getSplitBulkPlan();
    $("outputRows").innerHTML = "";
    plan.pages.forEach((pages, index) => addOutputRow(pages, plan.names[index]));
    status(
      "splitBulkStatus",
      `${plan.range.count} baris berhasil dibuat: ${plan.names[0]} sampai ${plan.names.at(-1)}.`,
      "success"
    );
    status("splitStatus", "");
  } catch (error) {
    status("splitBulkStatus", error.message, "error");
  }
};

$("sourcePdf").onchange = async () => {
  try {
    assertPdfLibraries();
    const file = $("sourcePdf").files[0];

    if (!file) {
      state.pdfBytes = null;
      state.pdfPages = 0;
      $("pdfInfo").textContent = "Belum ada PDF dipilih.";
      return;
    }

    state.pdfBytes = new Uint8Array(await file.arrayBuffer());
    const doc = await PDFLib.PDFDocument.load(state.pdfBytes, { ignoreEncryption: false });
    state.pdfPages = doc.getPageCount();
    $("pdfInfo").innerHTML = `<b>${esc(file.name)}</b> — ${state.pdfPages} halaman`;
    status("splitStatus", "");
  } catch (error) {
    state.pdfBytes = null;
    state.pdfPages = 0;
    status("splitStatus", "PDF gagal dibaca: " + error.message, "error");
  }
};

$("autoPages").onclick = () => {
  if (!state.pdfPages) {
    status("splitStatus", "Pilih PDF sumber dahulu.", "error");
    return;
  }

  $("outputRows").innerHTML = "";
  for (let page = 1; page <= state.pdfPages; page++) {
    addOutputRow(String(page), `${String(page).padStart(3, "0")}_SPP_DAGRI`);
  }
  status("splitStatus", `${state.pdfPages} output dibuat otomatis. Nama dapat diedit.`, "success");
};

$("splitPdf").onclick = async () => {
  try {
    assertPdfLibraries();
    if (!state.pdfBytes) throw new Error("Pilih PDF sumber dahulu.");

    const outputs = [...document.querySelectorAll(".output-row")]
      .map(row => ({
        pages: row.querySelector(".out-pages").value.trim(),
        name: row.querySelector(".out-name").value.trim()
      }))
      .filter(item => item.pages || item.name);

    if (!outputs.length) throw new Error("Belum ada output.");
    outputs.forEach((item, index) => {
      if (!item.pages || !item.name) throw new Error(`Baris output ${index + 1} belum lengkap.`);
    });

    status("splitStatus", "Sedang memisahkan PDF...");
    const source = await PDFLib.PDFDocument.load(state.pdfBytes);
    const zip = new JSZip();
    const manifest = ["HASIL SPLIT PDF", ""];
    const usedNames = new Set();

    for (let index = 0; index < outputs.length; index++) {
      const pages = parseRange(outputs[index].pages, state.pdfPages);
      let name = safeName(outputs[index].name, `output-${index + 1}`);
      if (name.toLowerCase().endsWith(".pdf")) name = name.slice(0, -4);

      let uniqueName = name;
      let suffix = 2;
      while (usedNames.has(uniqueName.toLowerCase())) uniqueName = `${name}-${suffix++}`;
      usedNames.add(uniqueName.toLowerCase());

      const outputDocument = await PDFLib.PDFDocument.create();
      const copiedPages = await outputDocument.copyPages(source, pages.map(page => page - 1));
      copiedPages.forEach(page => outputDocument.addPage(page));

      const bytes = await outputDocument.save();
      zip.file(uniqueName + ".pdf", bytes);
      manifest.push(
        `${index + 1}. ${uniqueName}.pdf | halaman sumber: ${outputs[index].pages} | ${pages.length} halaman`
      );
    }

    zip.file("MANIFEST.txt", manifest.join("\r\n"));
    const blob = await zip.generateAsync({ type: "blob" });
    downloadBlob(blob, safeName($("zipName").value, "HASIL-SPLIT-PDF") + ".zip");
    status("splitStatus", `${outputs.length} PDF berhasil dibuat dan di-download dalam ZIP.`, "success");
  } catch (error) {
    console.error(error);
    status("splitStatus", error.message, "error");
  }
};

function parseRange(value, total) {
  const result = [];
  const seen = new Set();

  for (const raw of value.split(",")) {
    const part = raw.trim();
    if (!part) continue;

    if (part.includes("-")) {
      const [start, end] = part.split("-").map(Number);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) {
        throw new Error(`Range tidak valid: ${part}`);
      }
      for (let page = start; page <= end; page++) push(page);
    } else {
      const page = Number(part);
      if (!Number.isInteger(page)) throw new Error(`Halaman tidak valid: ${part}`);
      push(page);
    }
  }

  function push(page) {
    if (page < 1 || page > total) throw new Error(`Halaman ${page} di luar PDF (1-${total}).`);
    if (!seen.has(page)) {
      seen.add(page);
      result.push(page);
    }
  }

  if (!result.length) throw new Error("Range halaman kosong.");
  return result;
}

// -----------------------------------------------------------------------------
// Fitur 03: Google Drive Duplicator + QR
// -----------------------------------------------------------------------------

function addDriveRow(sourceLink = "", outputName = "", folderLink = "") {
  const row = document.createElement("div");
  row.className = "drive-row";
  row.innerHTML = `
    <input class="drive-source" placeholder="Link file yang mau dicopy" value="${esc(sourceLink)}">
    <input class="drive-name" placeholder="Nama file output" value="${esc(outputName)}">
    <input class="drive-folder" placeholder="Link folder departemen tujuan" value="${esc(folderLink)}">
    <button class="remove" title="Hapus">×</button>
  `;
  row.querySelector(".remove").onclick = () => row.remove();
  $("driveRows").appendChild(row);
}

function readDriveRows() {
  return [...document.querySelectorAll(".drive-row")]
    .map(row => ({
      sourceLink: row.querySelector(".drive-source").value.trim(),
      outputName: row.querySelector(".drive-name").value.trim(),
      folderLink: row.querySelector(".drive-folder").value.trim()
    }))
    .filter(item => item.sourceLink || item.outputName || item.folderLink);
}

async function apiJson(path, options = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) clearDriveSession();
    const error = new Error(payload.error || `Server gagal memproses permintaan (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function clearDriveSession() {
  state.driveUser = null;
  updateDriveAuthUi();
}

function updateDriveAuthUi() {
  const connected = Boolean(state.driveUser);
  $("googleLogin").classList.toggle("hidden", connected);
  $("googleLogout").classList.toggle("hidden", !connected);
  $("duplicateDrive").disabled = !connected;

  if (connected) {
    $("driveAccountName").textContent = state.driveUser.displayName || "Akun BEM FTEIC";
    $("driveAccountEmail").textContent = state.driveUser.emailAddress || state.allowedGoogleEmail;
    status("driveAuthStatus", "Login terverifikasi oleh backend. Fitur Drive siap digunakan.", "success");
    return;
  }

  $("driveAccountName").textContent = "Belum login";
  $("driveAccountEmail").textContent = `Akun yang diizinkan: ${state.allowedGoogleEmail}`;
  status("driveAuthStatus", "Login diperlukan. Validasi email dan token dilakukan di server Vercel.");
}

async function loadDriveSession() {
  try {
    const response = await fetch("/api/auth/me", {
      credentials: "same-origin",
      headers: { Accept: "application/json" }
    });
    const payload = await response.json().catch(() => ({}));
    if (payload.allowedEmail) state.allowedGoogleEmail = payload.allowedEmail;

    if (!response.ok || !payload.authenticated) {
      state.driveUser = null;
    } else {
      state.driveUser = {
        displayName: payload.user?.name || "Akun BEM FTEIC",
        emailAddress: payload.user?.email || state.allowedGoogleEmail,
        photoLink: payload.user?.picture || ""
      };
    }
  } catch (error) {
    console.error("Gagal memeriksa sesi:", error);
    state.driveUser = null;
  }

  updateDriveAuthUi();

  const url = new URL(location.href);
  const authError = url.searchParams.get("auth_error");
  const loginSuccess = url.searchParams.get("login");
  if (authError) status("driveAuthStatus", authError, "error");
  else if (loginSuccess === "success" && state.driveUser) {
    status("driveAuthStatus", "Login Google berhasil dan sesi aman telah dibuat.", "success");
  }
  if (authError || loginSuccess) {
    url.searchParams.delete("auth_error");
    url.searchParams.delete("login");
    history.replaceState({}, "", url.pathname + url.search + url.hash);
  }
}

async function ensureGoogleDriveAccess() {
  if (!state.driveUser) {
    throw new Error("Silakan login menggunakan akun BEM terlebih dahulu.");
  }
}

async function copyDriveFile(sourceId, folderId, outputName) {
  return apiJson("/api/drive/copy", {
    method: "POST",
    body: JSON.stringify({ sourceId, folderId, outputName })
  });
}

function renderDriveSuccess({ copiedFile, folder, link, qrBlob, qrFilename }) {
  const qrUrl = URL.createObjectURL(qrBlob);
  const card = document.createElement("article");
  card.className = "drive-result-card";
  card.innerHTML = `
    <div class="qr-preview"><img src="${qrUrl}" alt="QR ${esc(copiedFile.name)}"></div>
    <h3>${esc(copiedFile.name)}</h3>
    <p>Berhasil disalin ke folder <b>${esc(folder.name)}</b>.</p>
    <div class="result-actions">
      <a class="btn primary" href="${esc(link)}" target="_blank" rel="noopener">Buka Drive</a>
      <a class="btn secondary" href="${qrUrl}" download="${esc(qrFilename)}">Download QR</a>
    </div>
  `;
  $("driveResults").appendChild(card);
}

function renderDriveError(item, error) {
  const card = document.createElement("article");
  card.className = "drive-result-card result-error";
  card.innerHTML = `
    <h3>${esc(item.outputName || "File gagal diproses")}</h3>
    <p>${esc(error.message)}</p>
  `;
  $("driveResults").appendChild(card);
}

$("googleLogin").onclick = () => {
  location.href = "/api/auth/login";
};

$("googleLogout").onclick = async () => {
  try {
    await apiJson("/api/auth/logout", { method: "POST" });
    clearDriveSession();
    status("driveAuthStatus", "Sesi Google telah dihapus dan akses aplikasi dicabut.", "success");
  } catch (error) {
    status("driveAuthStatus", error.message, "error");
  }
};

$("addDriveRow").onclick = () => addDriveRow();
$("clearDrive").onclick = () => {
  $("driveRows").innerHTML = "";
  $("driveResults").innerHTML = "";
  $("downloadDriveQrZip").classList.add("hidden");
  state.driveQrZip = null;
  addDriveRow();
};

function getDriveBulkPlan() {
  const sourceLink = $("driveBulkSource").value.trim();
  const folderLink = $("driveBulkFolder").value.trim();
  if (!sourceLink) throw new Error("Link file sumber wajib diisi.");
  if (!folderLink) throw new Error("Link folder tujuan wajib diisi.");

  extractDriveId(sourceLink, "Link file sumber");
  extractDriveId(folderLink, "Link folder tujuan");

  const range = readNumberRange($("driveStartNumber").value, $("driveEndNumber").value);
  const letterType = normalizeNamePart($("driveLetterType").value, "Jenis surat");
  const department = normalizeNamePart($("driveDepartment").value, "Departemen / sumber");

  const items = Array.from({ length: range.count }, (_, index) => {
    const numberText = formatSequenceNumber(range.start + index, range.width);
    return {
      sourceLink,
      folderLink,
      outputName: buildDocumentName(numberText, letterType, department)
    };
  });

  return { range, items, letterType, department };
}

function updateDriveBulkPreview() {
  const preview = $("driveBulkPreview");
  try {
    const plan = getDriveBulkPlan();
    preview.innerHTML = `<b>${plan.range.count} baris</b> akan ditambahkan: <span>${esc(plan.items[0].outputName)}${plan.range.count > 1 ? ` &nbsp;…&nbsp; ${esc(plan.items.at(-1).outputName)}` : ""}</span>`;
    preview.classList.remove("preview-error");
  } catch (error) {
    preview.textContent = error.message;
    preview.classList.add("preview-error");
  }
}

[
  "driveBulkSource", "driveBulkFolder", "driveStartNumber", "driveEndNumber",
  "driveLetterType", "driveDepartment"
].forEach(id => $(id).addEventListener("input", updateDriveBulkPreview));

$("generateDriveBulk").onclick = () => {
  try {
    const plan = getDriveBulkPlan();

    // Baris kosong bawaan dibuang, tetapi batch yang sudah dibuat tetap dipertahankan.
    // Dengan begitu pengguna bisa generate DAGRI lalu PSDM tanpa menulis ulang tiap baris.
    if (driveRowsAreBlank()) $("driveRows").innerHTML = "";
    plan.items.forEach(item => addDriveRow(item.sourceLink, item.outputName, item.folderLink));

    status(
      "driveBulkStatus",
      `${plan.range.count} baris ${plan.department} ditambahkan. Total daftar sekarang ${readDriveRows().length} file.`,
      "success"
    );
    status("driveStatus", "");
  } catch (error) {
    status("driveBulkStatus", error.message, "error");
  }
};

$("duplicateDrive").onclick = async () => {
  const button = $("duplicateDrive");

  try {
    assertQrLibraries();
    const items = readDriveRows();
    if (!items.length) throw new Error("Belum ada file yang akan diduplikasi.");

    const normalizedItems = items.map((item, index) => {
      if (!item.sourceLink || !item.outputName || !item.folderLink) {
        throw new Error(`Baris Drive ${index + 1} belum lengkap.`);
      }
      return {
        ...item,
        sourceId: extractDriveId(item.sourceLink, `Link file sumber baris ${index + 1}`),
        folderId: extractDriveId(item.folderLink, `Link folder tujuan baris ${index + 1}`)
      };
    });

    button.disabled = true;
    $("driveResults").innerHTML = "";
    $("downloadDriveQrZip").classList.add("hidden");
    state.driveQrZip = null;

    await ensureGoogleDriveAccess();

    const size = Number($("driveQrSize").value);
    const logoRatio = Number($("driveLogoSize").value);
    const zip = new JSZip();
    const manifest = ["HASIL DRIVE DUPLICATOR + QR", `Akun: ${state.driveUser.emailAddress}`, ""];

    let successCount = 0;
    let failedCount = 0;

    for (let index = 0; index < normalizedItems.length; index++) {
      const item = normalizedItems[index];
      status(
        "driveStatus",
        `Memproses ${index + 1}/${normalizedItems.length}: ${item.outputName}...`
      );

      try {
        const result = await copyDriveFile(item.sourceId, item.folderId, item.outputName);
        const folder = result.folder;
        const copiedFile = result.file;
        const link = copiedFile.webViewLink || `https://drive.google.com/open?id=${copiedFile.id}`;
        const qrFilename = safeName(copiedFile.name, `drive-file-${index + 1}`) + "-QR.png";
        const qrBlob = await createBrandedQrBlob(link, size, logoRatio);

        zip.file(qrFilename, qrBlob);
        manifest.push(
          `${index + 1}. ${copiedFile.name} | ${link} | folder: ${folder.name}`
        );
        renderDriveSuccess({ copiedFile, folder, link, qrBlob, qrFilename });
        successCount++;
      } catch (error) {
        console.error(error);
        renderDriveError(item, error);
        manifest.push(`${index + 1}. GAGAL: ${item.outputName} | ${error.message}`);
        failedCount++;
      }
    }

    if (successCount) {
      zip.file("MANIFEST.txt", manifest.join("\r\n"));
      state.driveQrZip = await zip.generateAsync({ type: "blob" });
      $("downloadDriveQrZip").classList.remove("hidden");
    }

    const summary = `${successCount} berhasil, ${failedCount} gagal.`;
    status("driveStatus", `Proses selesai: ${summary}`, failedCount ? "error" : "success");
  } catch (error) {
    console.error(error);
    status("driveStatus", error.message, "error");
  } finally {
    button.disabled = !state.driveUser;
  }
};

$("downloadDriveQrZip").onclick = () => {
  if (state.driveQrZip) {
    downloadBlob(state.driveQrZip, "QR-HASIL-DUPLICATE-DRIVE-BEM-FTEIC.zip");
  }
};

// -----------------------------------------------------------------------------
// Dialog Paste Banyak
// -----------------------------------------------------------------------------

const dialog = $("pasteDialog");

$("pasteQr").onclick = () => openPaste("qr");
$("pasteNames").onclick = () => openPaste("outputs");
$("pasteDrive").onclick = () => openPaste("drive");

function openPaste(mode) {
  state.pasteMode = mode;
  $("dialogText").value = "";

  if (mode === "qr") {
    $("dialogTitle").textContent = "Paste Banyak QR";
    $("dialogHelp").textContent =
      "Satu baris: nama file | link. Contoh: 001_SPP_DAGRI | https://drive.google.com/...";
  } else if (mode === "outputs") {
    $("dialogTitle").textContent = "Paste Daftar Output";
    $("dialogHelp").textContent =
      "Gunakan halaman | nama file. Contoh: 1-2 | 001_SPP_DAGRI. Boleh paste nama saja; halaman diisi 1, 2, 3, dst.";
  } else {
    $("dialogTitle").textContent = "Paste Banyak Drive Duplicator";
    $("dialogHelp").textContent =
      "Satu baris: link file sumber | nama file output | link folder tujuan.";
  }

  dialog.showModal();
}

$("applyPaste").onclick = event => {
  event.preventDefault();
  const lines = $("dialogText").value
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (state.pasteMode === "qr") {
    for (const line of lines) {
      const parts = line.split("|");
      addQrRow((parts.shift() || "").trim(), parts.join("|").trim());
    }
  } else if (state.pasteMode === "outputs") {
    for (let index = 0; index < lines.length; index++) {
      const parts = lines[index].split("|");
      if (parts.length > 1) {
        addOutputRow((parts.shift() || "").trim(), parts.join("|").trim());
      } else {
        addOutputRow(String(index + 1), lines[index]);
      }
    }
  } else if (state.pasteMode === "drive") {
    for (const line of lines) {
      const parts = line.split("|").map(part => part.trim());
      addDriveRow(parts[0] || "", parts[1] || "", parts.slice(2).join("|") || "");
    }
  }

  dialog.close();
};

// -----------------------------------------------------------------------------
// Nilai awal
// -----------------------------------------------------------------------------

addQrRow();
addQrRow();
addOutputRow("1", "001_SPP_DAGRI");
addDriveRow();
updateSplitGeneratorMode();
updateDriveBulkPreview();
updateDriveAuthUi();
loadDriveSession();
