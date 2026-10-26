import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {convertCursor} from "../docs/cursor.js";
import {createZip} from "../docs/zip.js";

const cases = JSON.parse(readFileSync(0, "utf8"));
const results = [];
for (const item of cases) {
  const {data, results: attempts} = await convertCursor(Buffer.from(item.data, "base64"), item.animated, item.scales);
  results.push({statuses: attempts.map(result => result.status),
    hash: data ? createHash("sha256").update(data).digest("hex") : null});
}
const zip = createZip([
  {name: "pack_upscaled/하위/Arrow.cur", data: Buffer.from(cases[0].data, "base64")},
  {name: "pack_upscaled/install.inf", data: new TextEncoder().encode('pointer="하위/Arrow.cur"')},
]);
console.log(JSON.stringify({results, zip: Buffer.from(zip).toString("base64")}));
