const $=id=>document.getElementById(id);
const state={pdfBytes:null,pdfPages:0,qrZip:null,pasteMode:null};

document.querySelectorAll(".nav").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelectorAll(".nav").forEach(x=>x.classList.remove("active"));
  document.querySelectorAll(".panel").forEach(x=>x.classList.remove("active"));
  btn.classList.add("active"); $("panel-"+btn.dataset.panel).classList.add("active");
}));

function status(id,text,type=""){const el=$(id);el.textContent=text;el.className=`status ${type}`}
function esc(v){return String(v).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;")}
function safeName(v,fallback="file"){return (v||fallback).replace(/[<>:"/\\|?*\x00-\x1F]/g,"-").replace(/\s+/g," ").trim()||fallback}
function addQrRow(name="",link=""){
  const row=document.createElement("div");row.className="qr-row";
  row.innerHTML=`<input class="qr-name" placeholder="001_SPP_DAGRI" value="${esc(name)}"><input class="qr-link" placeholder="https://drive.google.com/file/d/..." value="${esc(link)}"><button class="remove" title="Hapus">×</button>`;
  row.querySelector(".remove").onclick=()=>row.remove();$("qrRows").appendChild(row);
}
function addOutputRow(pages="",name=""){
  const row=document.createElement("div");row.className="output-row";
  row.innerHTML=`<input class="out-pages" placeholder="1 atau 1-2" value="${esc(pages)}"><input class="out-name" placeholder="001_SPP_DAGRI" value="${esc(name)}"><button class="remove" title="Hapus">×</button>`;
  row.querySelector(".remove").onclick=()=>row.remove();$("outputRows").appendChild(row);
}
$("addQr").onclick=()=>addQrRow();$("clearQr").onclick=()=>{$("qrRows").innerHTML="";addQrRow()};
$("addOutput").onclick=()=>addOutputRow();$("clearOutputs").onclick=()=>{$("outputRows").innerHTML="";addOutputRow()};
addQrRow();addQrRow();addOutputRow("1","001_SPP_DAGRI");

function assertLibraries(){
  const missing=[];
  if(typeof QRCode==="undefined") missing.push("QR Code");
  if(typeof PDFLib==="undefined") missing.push("PDF");
  if(typeof JSZip==="undefined") missing.push("ZIP");
  if(missing.length) throw new Error(`Library ${missing.join(", ")} gagal dimuat. Pastikan internet aktif saat membuka aplikasi.`);
}

$("generateQr").onclick=async()=>{
  try{
    assertLibraries();
    const items=[...document.querySelectorAll(".qr-row")].map(r=>({name:r.querySelector(".qr-name").value.trim(),link:r.querySelector(".qr-link").value.trim()})).filter(x=>x.name||x.link);
    if(!items.length) throw new Error("Belum ada data QR.");
    items.forEach((x,i)=>{if(!x.name||!x.link)throw new Error(`Baris QR ${i+1} belum lengkap.`);try{new URL(x.link)}catch{throw new Error(`Link pada baris ${i+1} tidak valid.`)}});
    status("qrStatus","Sedang membuat QR...");
    $("qrResults").innerHTML="";
    const zip=new JSZip();
    const size=Number($("qrSize").value),logoRatio=Number($("logoSize").value);

    for(let i=0;i<items.length;i++){
      const item=items[i], filename=safeName(item.name,`QR-${i+1}`);
      const holder=document.createElement("div");holder.style.position="fixed";holder.style.left="-10000px";document.body.appendChild(holder);
      new QRCode(holder,{text:item.link,width:size,height:size,correctLevel:QRCode.CorrectLevel.H,colorDark:"#111111",colorLight:"#ffffff"});
      await wait(40);
      const source=holder.querySelector("canvas")||holder.querySelector("img");
      if(!source) throw new Error(`QR ${filename} gagal dibuat.`);
      const canvas=document.createElement("canvas");canvas.width=size;canvas.height=size;
      const ctx=canvas.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,size,size);ctx.drawImage(source,0,0,size,size);
      const logo=await loadImage("assets/logo-bem-fteic.jpeg");
      const logoSize=Math.round(size*logoRatio),pad=Math.round(logoSize*.12),plate=logoSize+pad*2,x=(size-plate)/2,y=(size-plate)/2;
      roundRect(ctx,x,y,plate,plate,Math.round(plate*.16));ctx.fillStyle="#fff";ctx.fill();
      ctx.save();ctx.beginPath();ctx.arc(size/2,size/2,logoSize/2,0,Math.PI*2);ctx.clip();ctx.drawImage(logo,(size-logoSize)/2,(size-logoSize)/2,logoSize,logoSize);ctx.restore();
      const blob=await canvasBlob(canvas);zip.file(filename+".png",blob);
      const url=URL.createObjectURL(blob);
      const card=document.createElement("div");card.className="qr-card";
      card.innerHTML=`<div class="qr-preview"><img src="${url}" alt="${esc(filename)}"></div><strong title="${esc(filename)}">${esc(filename)}</strong><a class="btn secondary" href="${url}" download="${esc(filename)}.png">Download PNG</a>`;
      $("qrResults").appendChild(card);holder.remove();
    }
    state.qrZip=await zip.generateAsync({type:"blob"});
    $("downloadQrZip").classList.remove("hidden");
    status("qrStatus",`${items.length} QR berhasil dibuat. Tes scan sebelum dipakai.`,"success");
  }catch(e){console.error(e);status("qrStatus",e.message,"error")}
};
$("downloadQrZip").onclick=()=>state.qrZip&&downloadBlob(state.qrZip,"BULK-QR-BEM-FTEIC.zip");

$("sourcePdf").onchange=async()=>{
  try{
    assertLibraries();
    const file=$("sourcePdf").files[0];if(!file){state.pdfBytes=null;state.pdfPages=0;$("pdfInfo").textContent="Belum ada PDF dipilih.";return}
    state.pdfBytes=new Uint8Array(await file.arrayBuffer());
    const doc=await PDFLib.PDFDocument.load(state.pdfBytes,{ignoreEncryption:false});
    state.pdfPages=doc.getPageCount();$("pdfInfo").innerHTML=`<b>${esc(file.name)}</b> — ${state.pdfPages} halaman`;
    status("splitStatus","");
  }catch(e){state.pdfBytes=null;state.pdfPages=0;status("splitStatus","PDF gagal dibaca: "+e.message,"error")}
};
$("autoPages").onclick=()=>{
  if(!state.pdfPages)return status("splitStatus","Pilih PDF sumber dahulu.","error");
  $("outputRows").innerHTML="";
  for(let i=1;i<=state.pdfPages;i++)addOutputRow(String(i),`${String(i).padStart(3,"0")}_SPP_DAGRI`);
  status("splitStatus",`${state.pdfPages} output dibuat otomatis. Nama dapat diedit.`,"success");
};
$("splitPdf").onclick=async()=>{
  try{
    assertLibraries();if(!state.pdfBytes)throw new Error("Pilih PDF sumber dahulu.");
    const outputs=[...document.querySelectorAll(".output-row")].map(r=>({pages:r.querySelector(".out-pages").value.trim(),name:r.querySelector(".out-name").value.trim()})).filter(x=>x.pages||x.name);
    if(!outputs.length)throw new Error("Belum ada output.");
    outputs.forEach((x,i)=>{if(!x.pages||!x.name)throw new Error(`Baris output ${i+1} belum lengkap.`)});
    status("splitStatus","Sedang memisahkan PDF...");
    const source=await PDFLib.PDFDocument.load(state.pdfBytes);
    const zip=new JSZip(),manifest=["HASIL SPLIT PDF",""];
    const used=new Set();
    for(let i=0;i<outputs.length;i++){
      const pages=parseRange(outputs[i].pages,state.pdfPages);
      let name=safeName(outputs[i].name,`output-${i+1}`);if(name.toLowerCase().endsWith(".pdf"))name=name.slice(0,-4);
      let unique=name,n=2;while(used.has(unique.toLowerCase()))unique=`${name}-${n++}`;used.add(unique.toLowerCase());
      const out=await PDFLib.PDFDocument.create();
      const copied=await out.copyPages(source,pages.map(p=>p-1));copied.forEach(p=>out.addPage(p));
      const bytes=await out.save();zip.file(unique+".pdf",bytes);
      manifest.push(`${i+1}. ${unique}.pdf | halaman sumber: ${outputs[i].pages} | ${pages.length} halaman`);
    }
    zip.file("MANIFEST.txt",manifest.join("\r\n"));
    const blob=await zip.generateAsync({type:"blob"});
    downloadBlob(blob,safeName($("zipName").value,"HASIL-SPLIT-PDF")+".zip");
    status("splitStatus",`${outputs.length} PDF berhasil dibuat dan di-download dalam ZIP.`,"success");
  }catch(e){console.error(e);status("splitStatus",e.message,"error")}
};

function parseRange(value,total){
  const result=[],seen=new Set();
  for(const raw of value.split(",")){const part=raw.trim();if(!part)continue;
    if(part.includes("-")){const [a,b]=part.split("-").map(Number);if(!Number.isInteger(a)||!Number.isInteger(b)||a>b)throw new Error(`Range tidak valid: ${part}`);for(let p=a;p<=b;p++)push(p)}
    else{const p=Number(part);if(!Number.isInteger(p))throw new Error(`Halaman tidak valid: ${part}`);push(p)}
  }
  function push(p){if(p<1||p>total)throw new Error(`Halaman ${p} di luar PDF (1-${total}).`);if(!seen.has(p)){seen.add(p);result.push(p)}}
  if(!result.length)throw new Error("Range halaman kosong.");return result;
}
function loadImage(src){return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error("Logo gagal dimuat."));i.src=src})}
function canvasBlob(canvas){return new Promise((res,rej)=>canvas.toBlob(b=>b?res(b):rej(new Error("PNG gagal dibuat.")),"image/png"))}
function wait(ms){return new Promise(r=>setTimeout(r,ms))}
function roundRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}
function downloadBlob(blob,name){const u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),30000)}

const dialog=$("pasteDialog");
$("pasteQr").onclick=()=>openPaste("qr");
$("pasteNames").onclick=()=>openPaste("outputs");
function openPaste(mode){state.pasteMode=mode;$("dialogText").value="";if(mode==="qr"){$("dialogTitle").textContent="Paste Banyak QR";$("dialogHelp").textContent="Satu baris: nama file | link. Contoh: 001_SPP_DAGRI | https://drive.google.com/..."}else{$("dialogTitle").textContent="Paste Daftar Output";$("dialogHelp").textContent="Gunakan halaman | nama file. Contoh: 1-2 | 001_SPP_DAGRI. Boleh juga paste nama saja; halaman akan diisi 1, 2, 3, dst."}dialog.showModal()}
$("applyPaste").onclick=e=>{e.preventDefault();const lines=$("dialogText").value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(state.pasteMode==="qr"){for(const line of lines){const p=line.split("|");addQrRow((p.shift()||"").trim(),p.join("|").trim())}}
  else{for(let i=0;i<lines.length;i++){const p=lines[i].split("|");if(p.length>1)addOutputRow((p.shift()||"").trim(),p.join("|").trim());else addOutputRow(String(i+1),lines[i])}}
  dialog.close();
};