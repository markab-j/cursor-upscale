import {convertCursor} from "./cursor.js";
import {createZip} from "./zip.js";

self.onmessage = async ({data: {files, scales, folderName}}) => {
  try {
    const cursors = files.filter(({file}) => /\.(cur|ani)$/i.test(file.name));
    if (!cursors.length) throw new Error("No CUR or ANI files found.");
    const archive = Boolean(folderName) || files.length > 1;
    const root = `${folderName || "cursors"}_upscaled`;
    const outputs = [], results = [];
    self.postMessage({type: "log", event: "start", count: cursors.length, scales: scales.map(scale => `${scale}×`).join(", ")});
    for (const [index, {file, path}] of files.entries()) {
      self.postMessage({type: "log", event: "read", file: path, index: index + 1, total: files.length});
      let data = new Uint8Array(await file.arrayBuffer());
      if (/\.(cur|ani)$/i.test(file.name)) {
        const converted = await convertCursor(data, /\.ani$/i.test(file.name), scales, result => {
          self.postMessage({type: "log", event: "attempt", file: path, result});
        });
        data = converted.data;
        results.push(...converted.results.map(result => ({...result, file: path})));
      }
      if (data) {
        const relative = folderName ? path.slice(folderName.length + 1) : path;
        const name = archive ? `${root}/${relative}` : file.name.replace(/(\.[^.]+)$/, "_upscaled$1");
        outputs.push({name, data});
        self.postMessage({type: "log", event: /\.inf$/i.test(file.name) ? "copied" : "written", file: name});
      }
    }
    if (archive && outputs.length) self.postMessage({type: "log", event: "packing"});
    const data = outputs.length ? (archive ? createZip(outputs) : outputs[0].data) : null;
    self.postMessage({type: "done", results, written: outputs.length, data,
      name: archive ? `${root}.zip` : outputs[0]?.name}, data ? [data.buffer] : []);
  } catch (error) {
    self.postMessage({type: "error", text: error.message});
  }
};
