const messages = {
  en: {
    scale: "Scale", all: "All", custom: "Custom", customScale: "Scale factor",
    drop: "Drop files", chooseFolder: "Choose folder", download: "Download", terminal: "Terminal",
    ready: "Ready", running: "Processing", done: "Finished", failed: "Failed", language: "Language", input: "Input",
    invalidScale: "Enter an integer of at least 2.", noCursors: "Choose CUR / ANI files or a folder containing them.",
    busy: "Wait for the current conversion to finish.", readError: "Could not read the selected files.",
    workerError: "Could not start the converter. Reload the page and try again.",
    partialFailure: "Some files could not be processed. See the terminal for details.",
    skippedSizes: "Some sizes exceed 256 × 256 px and were skipped.",
    start: "Files: {count} · Scale: {scales}", read: "Reading {file}", copied: "Copied {file}",
    written: "Written {file}", packing: "Creating ZIP…", noOutput: "No files to download.",
    summary: "{converted} converted · {skipped} skipped · {failed} failed",
    scaleSummary: "{scale}× {source} → {target} · {converted} converted · {skipped} skipped · {failed} failed",
    fileCount: "Files written: {count}", sizeLimit: "Output must fit within 256 × 256 px.",
    sourceLimit: "{width}×{height} becomes {targetWidth}×{targetHeight} at 2×; the limit is 256×256.",
    invalidCursor: "Not a valid Windows CUR file.", invalidAni: "Not a valid Windows ANI file.",
  },
  ko: {
    scale: "배율", all: "전체", custom: "직접 입력", customScale: "확대 배율",
    drop: "파일 놓기", chooseFolder: "폴더 선택", download: "다운로드", terminal: "터미널",
    ready: "준비됨", running: "처리 중", done: "완료", failed: "실패", language: "언어", input: "입력",
    invalidScale: "2 이상의 정수를 입력해 주세요.", noCursors: "CUR / ANI 파일이나 해당 파일이 있는 폴더를 선택해 주세요.",
    busy: "현재 변환이 끝날 때까지 기다려 주세요.", readError: "선택한 파일을 읽을 수 없습니다.",
    workerError: "변환기를 시작할 수 없습니다. 페이지를 새로고침해 주세요.",
    partialFailure: "처리하지 못한 파일이 있습니다. 터미널에서 확인해 주세요.",
    skippedSizes: "256 × 256px을 넘는 배율은 건너뛰었습니다.",
    start: "파일 {count}개 · 배율 {scales}", read: "읽는 중: {file}", copied: "복사됨: {file}",
    written: "저장됨: {file}", packing: "ZIP 생성 중…", noOutput: "다운로드할 파일이 없습니다.",
    summary: "성공 {converted} · 건너뜀 {skipped} · 실패 {failed}",
    scaleSummary: "{scale}× {source} → {target} · 성공 {converted} · 건너뜀 {skipped} · 실패 {failed}",
    fileCount: "저장한 파일: {count}개", sizeLimit: "출력 크기는 256 × 256px 이하여야 합니다.",
    sourceLimit: "{width}×{height}를 2배로 확대하면 {targetWidth}×{targetHeight}가 되어 256×256을 초과합니다.",
    invalidCursor: "올바른 Windows CUR 파일이 아닙니다.", invalidAni: "올바른 Windows ANI 파일이 아닙니다.",
  },
  ja: {
    scale: "倍率", all: "すべて", custom: "カスタム", customScale: "拡大倍率",
    drop: "ファイルをドロップ", chooseFolder: "フォルダを選択", download: "ダウンロード", terminal: "ターミナル",
    ready: "準備完了", running: "処理中", done: "完了", failed: "失敗", language: "言語", input: "入力",
    invalidScale: "2以上の整数を入力してください。", noCursors: "CUR / ANIファイル、またはそれらを含むフォルダを選択してください。",
    busy: "現在の変換が終わるまでお待ちください。", readError: "選択したファイルを読み込めませんでした。",
    workerError: "変換を開始できませんでした。ページを再読み込みしてください。",
    partialFailure: "処理できなかったファイルがあります。ターミナルをご確認ください。",
    skippedSizes: "256 × 256pxを超える倍率はスキップしました。",
    start: "ファイル数: {count} · 倍率: {scales}", read: "読み込み中: {file}", copied: "コピー済み: {file}",
    written: "保存済み: {file}", packing: "ZIPを作成中…", noOutput: "ダウンロードできるファイルがありません。",
    summary: "成功 {converted} · スキップ {skipped} · 失敗 {failed}",
    scaleSummary: "{scale}× {source} → {target} · 成功 {converted} · スキップ {skipped} · 失敗 {failed}",
    fileCount: "保存したファイル数: {count}", sizeLimit: "出力サイズは256 × 256px以下である必要があります。",
    sourceLimit: "{width}×{height}を2倍にすると{targetWidth}×{targetHeight}となり、256×256を超えます。",
    invalidCursor: "有効なWindows CURファイルではありません。", invalidAni: "有効なWindows ANIファイルではありません。",
  },
  zh: {
    scale: "倍率", all: "全部", custom: "自定义", customScale: "放大倍率",
    drop: "拖放文件", chooseFolder: "选择文件夹", download: "下载", terminal: "终端",
    ready: "就绪", running: "处理中", done: "已完成", failed: "失败", language: "语言", input: "输入",
    invalidScale: "请输入不小于2的整数。", noCursors: "请选择CUR / ANI文件或包含这些文件的文件夹。",
    busy: "请等待当前转换完成。", readError: "无法读取所选文件。",
    workerError: "无法启动转换器，请刷新页面后重试。",
    partialFailure: "部分文件无法处理，请查看终端。", skippedSizes: "已跳过超过256 × 256像素的倍率。",
    start: "文件数：{count} · 倍率：{scales}", read: "正在读取：{file}", copied: "已复制：{file}",
    written: "已保存：{file}", packing: "正在创建ZIP…", noOutput: "没有可下载的文件。",
    summary: "成功 {converted} · 跳过 {skipped} · 失败 {failed}",
    scaleSummary: "{scale}× {source} → {target} · 成功 {converted} · 跳过 {skipped} · 失败 {failed}",
    fileCount: "已保存文件数：{count}", sizeLimit: "输出尺寸不能超过256 × 256像素。",
    sourceLimit: "{width}×{height}放大2倍后为{targetWidth}×{targetHeight}，超过256×256。",
    invalidCursor: "不是有效的Windows CUR文件。", invalidAni: "不是有效的Windows ANI文件。",
  },
};

export let language = navigator.language.slice(0, 2);
if (!messages[language]) language = "en";

export function translate(key, values = {}) {
  return (messages[language][key] || messages.en[key]).replace(/\{(\w+)\}/g, (_, name) => values[name]);
}

export function setLanguage(value) {
  language = value;
  document.documentElement.lang = value === "zh" ? "zh-CN" : value;
  document.querySelectorAll("[data-i18n]").forEach(node => { node.textContent = translate(node.dataset.i18n); });
  document.getElementById("language").setAttribute("aria-label", translate("language"));
  document.querySelector(".input-panel").setAttribute("aria-label", translate("input"));
  document.getElementById("language").value = value;
  const font = value === "ja" ? "pretendard-jp" : "pretendard";
  document.getElementById("webfont").href = `https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/${font}-dynamic-subset.min.css`;
}

export function errorText(reason) {
  const source = reason.match(/^Source (\d+)x(\d+) becomes (\d+)x(\d+) at 2x;/);
  if (source) return translate("sourceLimit", {width: source[1], height: source[2], targetWidth: source[3], targetHeight: source[4]});
  if (/^Scaled (CUR|ANI) dimensions/.test(reason)) return translate("sizeLimit");
  if (reason.startsWith("Not a Windows CUR")) return translate("invalidCursor");
  if (reason.startsWith("Not a Windows ANI")) return translate("invalidAni");
  return reason;
}
