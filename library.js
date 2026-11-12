"use strict";

const folderInput = byId("folder");
const workFiles = byId("work-files");
const workName = byId("work-name");
const workSelect = byId("work");
const characterSelect = byId("character");
const useCharacter = byId("use-character");
const libraryStatus = byId("library-status");
const collator = new Intl.Collator("ja", { numeric: true });
let libraryKeys = [];
let busy = false;
let database;

function openLibrary() {
  database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open("png-camera-library", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("characters");
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        database = undefined;
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  }).catch((error) => {
    database = undefined;
    throw error;
  });
  return database;
}

async function readLibrary(read) {
  const db = await openLibrary();
  return new Promise((resolve, reject) => {
    const request = read(db.transaction("characters").objectStore("characters"));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function updateLibraryControls() {
  folderInput.disabled = busy;
  workFiles.disabled = busy;
  workName.disabled = busy;
  workSelect.disabled = busy || !workSelect.options.length;
  characterSelect.disabled = busy || !characterSelect.options.length;
  useCharacter.disabled = characterSelect.disabled;
}

function populateSelect(select, labels) {
  const previous = select.value;
  select.replaceChildren(...labels.map((label) => new Option(label, label)));
  if (labels.includes(previous)) select.value = previous;
}

function showCharacters() {
  const names = libraryKeys.filter(([work]) => work === workSelect.value).map(([, name]) => name);
  populateSelect(characterSelect, names.sort(collator.compare));
  updateLibraryControls();
}

async function refreshLibrary() {
  libraryKeys = await readLibrary((store) => store.getAllKeys());
  const works = [...new Set(libraryKeys.map(([work]) => work))];
  populateSelect(workSelect, works.sort(collator.compare));
  showCharacters();
}

async function storePng(db, key, png) {
  const blob = new Blob([await png.arrayBuffer()], { type: "image/png" });
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("characters", "readwrite");
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error);
    transaction.objectStore("characters").put(blob, key);
  });
}

function folderKey(file) {
  const [, work, ...path] = file.webkitRelativePath.split("/");
  return work && path.length ? [work, path.join("/")] : null;
}

async function importPngs(files, keyFor) {
  if (!files.length || busy) return;
  busy = true;
  updateLibraryControls();
  libraryStatus.textContent = "PNGを端末内に保存しています…";
  let count = 0;
  let skipped = 0;
  try {
    const db = await openLibrary();
    for (const file of files) {
      const key = keyFor(file);
      if (!key || !/\.png$/i.test(file.name) || !await isPng(file)) {
        skipped++;
        continue;
      }
      await storePng(db, key, file);
      count++;
    }
    await refreshLibrary();
    libraryStatus.textContent = count
      ? `${count}件のPNGを保存・更新しました。${skipped ? `対象外 ${skipped}件。` : ""}`
      : "対象のPNGがありません。作品別フォルダ内のPNGを選んでください。";
  } catch {
    await refreshLibrary().catch(() => {});
    libraryStatus.textContent = `${count}件保存しました。取り込みを完了できませんでした。Chromeの空き容量とサイトデータの設定を確認してください。`;
  } finally {
    busy = false;
    updateLibraryControls();
  }
}

folderInput.addEventListener("change", () => {
  const files = Array.from(folderInput.files);
  folderInput.value = "";
  void importPngs(files, folderKey);
});

workFiles.addEventListener("change", () => {
  const files = Array.from(workFiles.files);
  workFiles.value = "";
  const work = workName.value.trim();
  if (!work) {
    libraryStatus.textContent = "作品名を入力してからPNGを選び直してください。";
    workName.focus();
    return;
  }
  void importPngs(files, (file) => [work, file.name]);
});

workSelect.addEventListener("change", showCharacters);
useCharacter.addEventListener("click", async () => {
  const key = [workSelect.value, characterSelect.value];
  try {
    const blob = await readLibrary((store) => store.get(key));
    if (!blob) throw new Error("Missing image");
    if (await loadOverlay(blob)) {
      libraryStatus.textContent = `「${key[1]}」を撮影に使います。`;
      byId("preview").scrollIntoView({ block: "nearest" });
    } else {
      libraryStatus.textContent = "画像を表示できませんでした。";
    }
  } catch {
    libraryStatus.textContent = "保存済みの画像を開けませんでした。再度取り込んでください。";
  }
});

refreshLibrary().catch(() => {
  libraryStatus.textContent = "保存済みの一覧を開けませんでした。「透過PNGを選ぶ」で直接読み込めます。";
});
