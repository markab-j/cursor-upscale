import {language, setLanguage, translate, errorText} from "./i18n.js";

const find = id => document.getElementById(id);
const download = find("download"), terminal = find("terminal"), log = find("log");
const modes = [...document.querySelectorAll('[name="scale-mode"]')];
const sizesText = (sizes, scale = 1) => sizes.map(([w, h]) => `${w * scale}×${h * scale}`).join(", ") || "?";
const records = [];
let worker, busy = false, downloadUrl, outputName, started = 0, rejectionKey = "";

function selectedScales() {
  const mode = modes.find(input => input.checked).value;
  return mode === "all" ? [2, 5, 10] : [mode === "custom" ? Number(find("scale").value) : Number(mode)];
}

function updateScale() {
  const index = modes.findIndex(input => input.checked);
  const custom = modes[index].value === "custom";
  find("segments").style.setProperty("--active", index);
  find("custom-scale").classList.toggle("visible", custom);
  find("custom-scale").inert = !custom;
  find("scale").disabled = !custom || busy;
  if (!busy) {
    const scales = selectedScales();
    find("command").textContent = `cursor-upscale ${scales.length > 1 ? "--all" : `--scale ${scales[0]}`}`;
  }
}

function setState(state) {
  terminal.dataset.state = state;
  find("status").textContent = translate(state);
}

function showRejection(key = "") {
  rejectionKey = key;
  find("rejection").textContent = key ? translate(key) : "";
}

function setBusy(value) {
  busy = value;
  find("settings").disabled = value;
  find("choose-files").disabled = value;
  find("choose-folder").disabled = value;
  find("drop").setAttribute("aria-busy", value);
  find("scale").disabled = value || modes.find(input => input.checked).value !== "custom";
}

function renderLine(record) {
  const row = document.createElement("div");
  let tag = "INFO", style = "", text;
  if (record.event === "attempt") {
    const result = record.result;
    tag = {converted: "OK", skipped: "SKIP", failed: "ERROR"}[result.status];
    style = result.status === "converted" ? "ok" : result.status;
    text = `${record.file} · ${result.scale}× · ${sizesText(result.sizes)} → ${sizesText(result.sizes, result.scale)}`;
    if (result.reason) text += `\n${errorText(result.reason)}`;
  } else if (record.event === "done") {
    tag = "EXIT"; style = "done"; text = "Done!";
  } else if (record.event === "error") {
    tag = "ERROR"; style = "failed"; text = record.reason ? errorText(record.reason) : translate(record.key);
  } else {
    tag = {read: "READ", copied: "COPY", written: "WRITE", packing: "ZIP", scaleSummary: "STAT"}[record.event] || "INFO";
    text = translate(record.event, record);
  }
  row.className = `log-line ${style}`;
  for (const [className, value] of [["log-time", `${record.seconds.toFixed(2)}s`], ["log-tag", tag], ["log-text", text]]) {
    const span = document.createElement("span");
    span.className = className;
    span.textContent = value;
    row.append(span);
  }
  return row;
}

function appendLog(record) {
  record.seconds = (performance.now() - started) / 1000;
  records.push(record);
  log.append(renderLine(record));
  find("terminal-body").scrollTop = find("terminal-body").scrollHeight;
}

function finishWorker() {
  worker?.terminate();
  worker = null;
  setBusy(false);
}

function conversionFailed(key, reason) {
  finishWorker();
  setState("failed");
  showRejection(key);
  appendLog({event: "error", key, reason});
}

function conversionDone(message) {
  finishWorker();
  const counts = {converted: 0, skipped: 0, failed: 0};
  const groups = new Map();
  for (const result of message.results) {
    counts[result.status]++;
    const key = `${result.scale}:${JSON.stringify(result.sizes)}`;
    if (!groups.has(key)) groups.set(key, {scale: result.scale, source: sizesText(result.sizes),
      target: sizesText(result.sizes, result.scale), converted: 0, skipped: 0, failed: 0});
    groups.get(key)[result.status]++;
  }
  for (const group of [...groups.values()].sort((a, b) => a.scale - b.scale)) appendLog({event: "scaleSummary", ...group});
  appendLog({event: "summary", ...counts});
  appendLog({event: "fileCount", count: message.written});
  if (counts.failed) showRejection("partialFailure");
  else if (counts.skipped) showRejection("skippedSizes");
  else showRejection();
  if (!message.data) {
    setState("failed");
    appendLog({event: "error", key: "noOutput"});
    return;
  }
  const type = message.name.endsWith(".zip") ? "application/zip" : "application/octet-stream";
  downloadUrl = URL.createObjectURL(new Blob([message.data], {type}));
  outputName = message.name;
  find("output-name").textContent = outputName;
  find("output-name").title = outputName;
  appendLog({event: "done"});
  setState("done");
  download.disabled = false;
}

function convert(selected, folderName = "") {
  if (busy) { showRejection("busy"); return; }
  const scales = selectedScales();
  if (scales.some(scale => !Number.isInteger(scale) || scale < 2)) { showRejection("invalidScale"); return; }
  const files = selected.filter(({file}) => /\.(cur|ani|inf)$/i.test(file.name));
  if (!files.some(({file}) => /\.(cur|ani)$/i.test(file.name))) { showRejection("noCursors"); return; }
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = null;
  download.disabled = true;
  find("output-name").textContent = "";
  find("output-name").title = "";
  find("progress").textContent = "";
  records.length = 0;
  log.replaceChildren();
  started = performance.now();
  showRejection();
  setBusy(true);
  setState("running");
  try {
    worker = new Worker(new URL("worker.js", import.meta.url), {type: "module"});
    worker.onerror = () => conversionFailed("workerError");
    worker.onmessage = ({data: message}) => {
      if (message.type === "log") {
        appendLog(message);
        if (message.event === "read") find("progress").textContent = `${message.index} / ${message.total}`;
      } else if (message.type === "error") conversionFailed("partialFailure", message.text);
      else if (message.type === "done") conversionDone(message);
    };
    worker.postMessage({files, scales, folderName});
  } catch (error) {
    conversionFailed("workerError", error.message);
  }
}

async function readEntry(entry, parent = "") {
  const path = `${parent}${entry.name}`;
  if (entry.isFile) return new Promise((resolve, reject) => entry.file(file => resolve([{file, path}]), reject));
  const reader = entry.createReader(), children = [];
  for (;;) {
    const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    children.push(...batch);
  }
  return (await Promise.all(children.map(child => readEntry(child, `${path}/`)))).flat();
}

for (const kind of ["files", "folder"]) {
  find(`choose-${kind}`).onclick = () => find(kind).click();
  find(kind).onchange = event => {
    const files = [...event.target.files].map(file => ({file, path: file.webkitRelativePath || file.name}));
    if (files.length) convert(files, kind === "folder" ? files[0].path.split("/")[0] : "");
    event.target.value = "";
  };
}
for (const input of modes) input.onchange = () => {
  updateScale();
  if (input.value === "custom") find("scale").focus();
};
find("scale").oninput = updateScale;
find("language").onchange = event => {
  setLanguage(event.target.value);
  setState(terminal.dataset.state);
  showRejection(rejectionKey);
  log.replaceChildren(...records.map(renderLine));
  find("terminal-body").scrollTop = find("terminal-body").scrollHeight;
};
download.onclick = () => {
  const link = document.createElement("a");
  link.href = downloadUrl;
  link.download = outputName;
  document.body.append(link);
  link.click();
  link.remove();
};

const drop = find("drop");
document.ondragover = event => event.preventDefault();
document.ondrop = event => event.preventDefault();
drop.ondragover = event => { event.preventDefault(); if (!busy) drop.classList.add("dragging"); };
drop.ondragleave = event => { if (!drop.contains(event.relatedTarget)) drop.classList.remove("dragging"); };
drop.ondrop = async event => {
  event.preventDefault();
  drop.classList.remove("dragging");
  if (busy) { showRejection("busy"); return; }
  // Capture entries while the drop event still grants access to the data store.
  const entries = [...event.dataTransfer.items].map(item => item.webkitGetAsEntry?.()).filter(Boolean);
  const fallback = [...event.dataTransfer.files].map(file => ({file, path: file.name}));
  setBusy(true);
  try {
    const files = entries.length ? (await Promise.all(entries.map(entry => readEntry(entry)))).flat() : fallback;
    const folderName = entries.length === 1 && entries[0].isDirectory ? entries[0].name : "";
    setBusy(false);
    convert(files, folderName);
  } catch {
    setBusy(false);
    showRejection("readError");
  }
};

setLanguage(language);
updateScale();
