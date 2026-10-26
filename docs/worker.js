import {convertCursor} from "./cursor.js";
import {createZip} from "./zip.js";

self.onmessage = async ({data: {files, scales, folderName}}) => {
  try {
    const cursors = files.filter(file => /\.(cur|ani)$/i.test(file.name));
    if (!cursors.length) throw new Error("No CUR or ANI files found.");
    const archive = Boolean(folderName) || files.length > 1;
    const root = `${folderName || "cursors"}_upscaled`;
    const outputs = [], results = [];
    for (const [index, file] of files.entries()) {
      const path = file.webkitRelativePath || file.name;
      self.postMessage({type: "progress", text: `Processing ${index + 1} / ${files.length}…`});
      let data = new Uint8Array(await file.arrayBuffer());
      if (/\.(cur|ani)$/i.test(file.name)) {
        const converted = await convertCursor(data, /\.ani$/i.test(file.name), scales);
        data = converted.data;
        results.push(...converted.results.map(result => ({...result, file: path})));
      }
      if (data) {
        const relative = folderName ? path.slice(folderName.length + 1) : path;
        const name = archive ? `${root}/${relative}` : file.name.replace(/(\.[^.]+)$/, "_upscaled$1");
        outputs.push({name, data});
      }
    }
    const data = outputs.length ? (archive ? createZip(outputs) : outputs[0].data) : null;
    self.postMessage({type: "done", results, written: outputs.length, data,
      name: archive ? `${root}.zip` : outputs[0]?.name}, data ? [data.buffer] : []);
  } catch (error) {
    self.postMessage({type: "error", text: error.message});
  }
};
