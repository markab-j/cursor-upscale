const find = id => document.getElementById(id);
const status = find("status"), download = find("download");
const sizesText = (sizes, scale = 1) => sizes.map(([w, h]) => `${w * scale}×${h * scale}`).join(", ") || "Unknown";
let worker, downloadUrl;

function showResults(results) {
  const groups = new Map(), reasons = new Map();
  for (const result of results) {
    const key = `${result.scale}:${JSON.stringify(result.sizes)}`;
    if (!groups.has(key)) groups.set(key, {...result, converted: 0, skipped: 0, failed: 0});
    groups.get(key)[result.status]++;
    if (result.reason) {
      const reason = `${result.status === "skipped" ? "Skipped" : "Failed"}: ${result.reason}`;
      reasons.set(reason, (reasons.get(reason) || 0) + 1);
    }
  }
  find("counts").replaceChildren();
  for (const group of [...groups.values()].sort((a, b) => a.scale - b.scale)) {
    const row = document.createElement("tr");
    for (const value of [`${group.scale}×`, sizesText(group.sizes), sizesText(group.sizes, group.scale), group.converted, group.skipped, group.failed]) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    find("counts").append(row);
  }
  find("reasons").textContent = [...reasons].map(([reason, count]) => `${count} ${reason}`).join("\n");
  find("details").textContent = results.map(result =>
    `${result.status.toUpperCase()}: ${result.file} (${result.scale}×; ${sizesText(result.sizes)} → ${sizesText(result.sizes, result.scale)})${result.reason ? ` — ${result.reason}` : ""}`
  ).join("\n");
  find("results").hidden = false;
}

function setBusy(busy) {
  find("settings").disabled = busy;
  find("choose-files").disabled = busy;
  find("choose-folder").disabled = busy;
}

function convert(selected, folderName = "") {
  if (worker) return;
  const all = document.querySelector('[name="mode"]:checked').value === "all";
  const scale = Number(find("scale").value);
  if (!all && (!Number.isInteger(scale) || scale < 2)) {
    status.textContent = "Scale must be an integer of at least 2.";
    return;
  }
  const files = [...selected].filter(file => /\.(cur|ani|inf)$/i.test(file.name));
  if (!files.length) { status.textContent = "Choose CUR or ANI files, or a folder containing them."; return; }
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  download.hidden = true;
  find("results").hidden = true;
  status.textContent = "Starting…";
  setBusy(true);
  worker = new Worker(new URL("worker.js", import.meta.url), {type: "module"});
  const finish = () => { worker.terminate(); worker = null; setBusy(false); };
  worker.onerror = () => { status.textContent = "Could not run the converter. Reload the page and try again."; finish(); };
  worker.onmessage = ({data: message}) => {
    if (message.type === "progress") { status.textContent = message.text; return; }
    finish();
    if (message.type === "error") { status.textContent = message.text; return; }
    showResults(message.results);
    const count = state => message.results.filter(result => result.status === state).length;
    status.textContent = `${count("converted")} converted, ${count("skipped")} skipped, ${count("failed")} failed.`;
    if (message.data) {
      downloadUrl = URL.createObjectURL(new Blob([message.data], {type: message.name.endsWith(".zip") ? "application/zip" : "application/octet-stream"}));
      download.href = downloadUrl;
      download.download = message.name;
      download.textContent = `Download ${message.name}`;
      download.hidden = false;
      download.click();
    }
  };
  worker.postMessage({files, scales: all ? [2, 5, 10] : [scale], folderName});
}

for (const kind of ["files", "folder"]) {
  find(`choose-${kind}`).onclick = () => find(kind).click();
  find(kind).onchange = event => {
    const files = event.target.files;
    if (files.length) convert(files, kind === "folder" ? files[0].webkitRelativePath.split("/")[0] : "");
    event.target.value = "";
  };
}
find("scale").oninput = () => { document.querySelector('[name="mode"][value="single"]').checked = true; };
const drop = find("drop");
drop.ondragover = event => { event.preventDefault(); drop.classList.add("dragging"); };
drop.ondragleave = () => drop.classList.remove("dragging");
drop.ondrop = event => {
  event.preventDefault();
  drop.classList.remove("dragging");
  convert(event.dataTransfer.files);
};
