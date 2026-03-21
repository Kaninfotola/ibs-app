const STORAGE_KEYS = {
  records: "ibs-records",
  foods: "ibs-foods",
  foodSortMode: "ibs-food-sort-mode"
};

const FOOD_SORT_MODES = {
  name: "name",
  newest: "newest"
};

const NAV_CONFIG = {
  home: { buttonId: "navHome", sectionId: "homeSection" },
  history: { buttonId: "navHistory", sectionId: "historySection", onShow: renderHistoryLog },
  food: { buttonId: "navFood", sectionId: "FoodSection", onShow: renderSavedFoods }
};

let appInitialized = false;
let historyCalendarVisible = false;
let historyCalendarDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let historySelectedDateKey = null;
let historyVisibleCount = 10;
let lastSelectedFoodSuggestion = "";
let lastSelectedTagSuggestion = "";

const HISTORY_PAGE_SIZE = 10;

function getSortedRecords() {
  return getRecords().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

function getRecordSortDate(record) {
  const createdAt = new Date(record?.createdAt || "");
  if (!Number.isNaN(createdAt.getTime())) {
    return createdAt;
  }

  return new Date(record?.timestamp || 0);
}

function compareRecordsByCreatedAtDescending(recordA, recordB) {
  const createdAtDifference = getRecordSortDate(recordB) - getRecordSortDate(recordA);
  if (createdAtDifference !== 0) {
    return createdAtDifference;
  }

  return new Date(recordB?.timestamp || 0) - new Date(recordA?.timestamp || 0);
}

function getHistorySortedRecords() {
  return getRecords().sort(compareRecordsByCreatedAtDescending);
}

function compareRecordTimestampsAscending(recordA, recordB) {
  return new Date(recordA.timestamp) - new Date(recordB.timestamp);
}

function getEntryIndexByTimestamp(records, timestamp) {
  return records.findIndex(entry => String(entry.timestamp) === String(timestamp));
}

function findCardByTimestamp(containerId, timestamp) {
  const container = byId(containerId);
  if (!container) return null;

  const timestampKey = String(timestamp);
  const directMatch = Array.from(container.querySelectorAll(".card")).find(card => card.dataset.entryTimestamp === timestampKey);
  if (directMatch) return directMatch;

  const cards = container.children;
  const localizedTimestamp = new Date(timestamp).toLocaleString();

  for (let index = 0; index < cards.length; index++) {
    const title = cards[index].querySelector("h3");
    if (title && title.textContent.includes(localizedTimestamp)) {
      return cards[index];
    }
  }

  return null;
}

function resolveCard(event, timestamp) {
  if (event && event.target) {
    const eventCard = event.target.closest(".card");
    if (eventCard) return eventCard;
  }

  return findCardByTimestamp("log", timestamp) || findCardByTimestamp("historyLog", timestamp);
}

function saveAndRefreshRecords(records) {
  saveRecords(records);
  renderUnifiedLog("log");
  renderHistoryLog();
}

function refreshEditedEntry(records, previousTimestamp, updatedEntry) {
  saveRecords(records);

  if (previousTimestamp !== updatedEntry.timestamp) {
    renderUnifiedLog("log");
    renderHistoryLog();
    return;
  }

  renderHistoryLog();

  const logCard = findCardByTimestamp("log", previousTimestamp);
  if (logCard) {
    logCard.replaceWith(createEntryCard(updatedEntry, "log"));
  }
}

function setActiveView(viewName) {
  Object.entries(NAV_CONFIG).forEach(([name, config]) => {
    const button = byId(config.buttonId);
    const section = byId(config.sectionId);
    const isActive = name === viewName;

    if (button) button.classList.toggle("active", isActive);
    if (section) section.style.display = isActive ? "block" : "none";
  });

  const activeConfig = NAV_CONFIG[viewName];
  if (activeConfig && typeof activeConfig.onShow === "function") {
    if (viewName === "history") {
      resetHistoryVisibleCount();
    }
    activeConfig.onShow();
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function initNavigation() {
  Object.entries(NAV_CONFIG).forEach(([viewName, config]) => {
    const button = byId(config.buttonId);
    if (!button) return;
    button.onclick = () => setActiveView(viewName);
  });
}

if ("serviceWorker" in navigator && supportsPwaFeatures()) {
  navigator.serviceWorker
    .register("service-worker.js", { updateViaCache: "none" })
    .catch(() => {});
}

function getRecords() {
  return readStoredArray(STORAGE_KEYS.records);
}

function saveRecords(records) {
  writeStoredArray(STORAGE_KEYS.records, records);
}

function getFoods() {
  return readStoredArray(STORAGE_KEYS.foods);
}

function saveFoods(foods) {
  writeStoredArray(STORAGE_KEYS.foods, foods);
}

function syncFoodsFromImportedRecords(importedRecords) {
  if (!Array.isArray(importedRecords) || importedRecords.length === 0) return;

  const foods = getFoods();
  let foodsChanged = false;

  importedRecords.forEach(record => {
    if (record.type !== "food_log" || !record.foodName) return;

    const existingFood = foods.find(food => food.name.toLowerCase() === record.foodName.toLowerCase());
    if (!existingFood) {
      foods.push({
        id: generateId(),
        name: record.foodName,
        tags: [...record.foodTags],
        createdAt: record.timestamp || new Date().toISOString()
      });
      foodsChanged = true;
      return;
    }

    const mergedTags = Array.from(new Set([...(existingFood.tags || []), ...record.foodTags]));
    if (mergedTags.length !== (existingFood.tags || []).length) {
      existingFood.tags = mergedTags;
      foodsChanged = true;
    }
  });

  if (foodsChanged) {
    saveFoods(foods);
    renderSavedFoods();
  }
}

function importRecordsFromJsonText(jsonText) {
  const payload = JSON.parse(jsonText);
  const importedItems = extractImportedRecords(payload);

  if (!importedItems) {
    throw new Error("Ungültiges Format. Erwartet wird eine exportierte JSON-Datei.");
  }

  const existingRecords = getRecords();
  const existingSignatures = new Set(existingRecords.map(getRecordSignature));
  const seenImportSignatures = new Set();
  const newRecords = [];
  let skippedDuplicates = 0;
  let skippedInvalid = 0;

  importedItems.forEach(item => {
    const normalizedRecord = normalizeImportedRecord(item);
    if (!normalizedRecord) {
      skippedInvalid += 1;
      return;
    }

    const signature = getRecordSignature(normalizedRecord);
    if (existingSignatures.has(signature) || seenImportSignatures.has(signature)) {
      skippedDuplicates += 1;
      return;
    }

    seenImportSignatures.add(signature);
    newRecords.push(normalizedRecord);
  });

  if (newRecords.length > 0) {
    const mergedRecords = existingRecords.concat(newRecords);
    saveRecords(mergedRecords);
    syncFoodsFromImportedRecords(newRecords);
    renderUnifiedLog("log");
    renderHistoryLog();
  }

  return {
    imported: newRecords.length,
    duplicates: skippedDuplicates,
    invalid: skippedInvalid
  };
}

function openImportRecordsDialog() {
  const input = byId("importRecordsInput");
  if (!input) return;
  input.value = "";
  input.click();
}

async function handleImportRecordsSelection(event) {
  const input = event.target;
  const file = input && input.files ? input.files[0] : null;
  if (!file) return;

  try {
    const jsonText = await file.text();
    const result = importRecordsFromJsonText(jsonText);
    alert(`Import abgeschlossen. Neu: ${result.imported}, Duplikate ignoriert: ${result.duplicates}, Ungültig: ${result.invalid}`);
  } catch (error) {
    alert(error && error.message ? error.message : "Import fehlgeschlagen.");
  } finally {
    input.value = "";
  }
}

function exportRecordsAsJson() {
  const exportData = {
    "ibs-records": getRecords().map(formatRecordForExport)
  };
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
  const downloadUrl = URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");
  const today = new Date();
  const fileDate = `${today.getFullYear()}-${padNumber(today.getMonth() + 1)}-${padNumber(today.getDate())}`;

  downloadLink.href = downloadUrl;
  downloadLink.download = `ibs-records-${fileDate}.json`;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
  URL.revokeObjectURL(downloadUrl);
}

function buildFoodDetails(entry, showAllTags) {
  const details = [];
  if (entry.speed && entry.speed !== 0) details.push(`Speed: ${entry.speed}`);
  if (entry.size && entry.size !== 0) details.push(`Size: ${entry.size}`);
  if (entry.risk && entry.risk !== 0) details.push(`Risiko: ${entry.risk}`);

  const cleanTags = Array.isArray(entry.foodTags) ? entry.foodTags.filter(Boolean) : [];
  if (cleanTags.length > 0) {
    const visibleTags = showAllTags ? cleanTags : cleanTags.slice(0, 5);
    const suffix = !showAllTags && cleanTags.length > 5 ? ", ..." : "";
   // details.push(`Zutaten: ${visibleTags.join(", ")}${suffix}`);
  }

  return details.join(" | ");
}

function createEntryCard(entry, targetElementId) {
  const card = document.createElement("div");
  card.className = "card entry-card";
  card.dataset.entryTimestamp = String(entry.timestamp);

  const header = document.createElement("div");
  header.className = "entry-card-header";

  const heading = document.createElement("div");
  heading.className = "entry-card-heading";

  const title = document.createElement("h3");
  title.className = "entry-card-title";

  const dateLine = document.createElement("div");
  dateLine.className = "entry-card-date";

  const labels = document.createElement("div");
  labels.className = "labels";
  const date = new Date(entry.timestamp).toLocaleString();
  const showAllTags = targetElementId === "historyLog";

  if (entry.type === "symptoms") {
    title.textContent = "Symptome";
    const pain = entry.pain && entry.pain !== 0 ? `Bauch: ${entry.pain}` : "";
    const bloating = entry.bloating && entry.bloating !== 0 ? `Blähungen: ${entry.bloating}` : "";
    const nausea = entry.nausea && entry.nausea !== 0 ? `Übelkeit: ${entry.nausea}` : "";
    labels.innerHTML = [pain, bloating, nausea].filter(Boolean).join(" | ");
  } else if (entry.type === "bm") {
    title.textContent = "Poopie";
    const bristol = `Bristol: ${entry.bristolScale}`;
    const evacuation = `Evacuation: ${entry.evacuation}`;
    const pressure = entry.pressure && entry.pressure !== 0 ? `Druck: ${entry.pressure}` : "";
    const wetness = entry.wetness && entry.wetness !== 0 ? `Nässe: ${entry.wetness}` : "";
    labels.innerHTML = [bristol, evacuation, pressure, wetness].filter(Boolean).join(" | ");
  } else if (entry.type === "food_log") {
    const foodName = entry.foodName || "Essen";
    title.textContent = `Essen - ${foodName}`;
    labels.textContent = buildFoodDetails(entry, showAllTags);
  } else {
    title.textContent = "Eintrag";
  }

  dateLine.textContent = date;
  heading.appendChild(title);
  heading.appendChild(dateLine);
  header.appendChild(heading);

  if (targetElementId === "historyLog") {
    header.appendChild(createCardActions([
      {
        text: "✏",
        onClick: event => editEntry(entry.timestamp, event),
        options: { title: "Bearbeiten", ariaLabel: "Bearbeiten" }
      },
      {
        text: "X",
        onClick: event => deleteEntry(entry.timestamp, event)
      }
    ]));
  }

  card.appendChild(header);
  card.appendChild(labels);

  if (entry.type === "food_log") {
    const tagsDiv = buildTagContainer(entry.foodTags, showAllTags);
    if (tagsDiv) card.appendChild(tagsDiv);
  }

  return card;
}

function renderUnifiedLog(targetElementId, options = {}) {
  const container = byId(targetElementId);
  if (!container) return;

  container.innerHTML = "";
  const data = Array.isArray(options.records) ? options.records : getSortedRecords();
  const maxItems = Number.isInteger(options.maxItems)
    ? options.maxItems
    : targetElementId === "log"
      ? 5
      : data.length;
  const visibleEntries = data.slice(0, maxItems);

  if (targetElementId === "historyLog" && visibleEntries.length === 0) {
    const emptyCard = document.createElement("div");
    emptyCard.className = "card";
    emptyCard.textContent = options.emptyMessage || "Keine Einträge vorhanden.";
    container.appendChild(emptyCard);
    return;
  }

  visibleEntries.forEach(entry => {
    container.appendChild(createEntryCard(entry, targetElementId));
  });

  if (targetElementId === "log" && data.length > maxItems) {
    const moreCard = document.createElement("div");
    moreCard.className = "card";
    moreCard.appendChild(createButton("Mehr sehen (History)", () => {
      const navHistory = byId("navHistory");
      if (navHistory) navHistory.click();
    }));
    container.appendChild(moreCard);
  }

  if (typeof options.onLoadMore === "function" && data.length > maxItems) {
    const moreCard = document.createElement("div");
    moreCard.className = "card";
    moreCard.appendChild(createButton(options.loadMoreLabel || "Mehr laden", options.onLoadMore, {
      className: "secondary-button"
    }));
    container.appendChild(moreCard);
  }
}

function renderSymptomsEditor(card, entry, records, entryIndex) {
  const painInput = createNumberSelect(0, 5, entry.pain);
  const bloatingInput = createNumberSelect(0, 5, entry.bloating);
  const nauseaInput = createNumberSelect(0, 5, entry.nausea);
  const dateInput = createDateTimeInput(entry.timestamp);
  const previousTimestamp = entry.timestamp;

  appendField(card, "Bauchschmerzen", painInput);
  appendField(card, "Blähungen", bloatingInput);
  appendField(card, "Übelkeit", nauseaInput);
  appendField(card, "Datum & Uhrzeit", dateInput);

  card.appendChild(createButton("Speichern", () => {
    entry.pain = parseInt(painInput.value, 10);
    entry.bloating = parseInt(bloatingInput.value, 10);
    entry.nausea = parseInt(nauseaInput.value, 10);
    updateEntryTimestamp(entry, dateInput);
    records[entryIndex] = entry;
    refreshEditedEntry(records, previousTimestamp, entry);
  }));
}

function renderBmEditor(card, entry, records, entryIndex) {
  const bristolInput = createNumberSelect(1, 7, entry.bristolScale);
  const evacuationInput = createChoiceSelect(["partial", "full"], entry.evacuation, {
    partial: "Teilweise",
    full: "Vollständig"
  });
  const pressureInput = createNumberSelect(0, 5, entry.pressure);
  const wetnessInput = createNumberSelect(0, 5, entry.wetness);
  const dateInput = createDateTimeInput(entry.timestamp);
  const previousTimestamp = entry.timestamp;

  appendField(card, "Bristol", bristolInput);
  appendField(card, "Evacuation", evacuationInput);
  appendField(card, "Druck", pressureInput);
  appendField(card, "Nässe", wetnessInput);
  appendField(card, "Datum & Uhrzeit", dateInput);

  card.appendChild(createButton("Speichern", () => {
    entry.bristolScale = parseInt(bristolInput.value, 10);
    entry.evacuation = evacuationInput.value;
    entry.pressure = parseInt(pressureInput.value, 10);
    entry.wetness = parseInt(wetnessInput.value, 10);
    updateEntryTimestamp(entry, dateInput);
    records[entryIndex] = entry;
    refreshEditedEntry(records, previousTimestamp, entry);
  }));
}

function renderFoodEditor(card, entry, records, entryIndex) {
  const speedInput = createNumberSelect(0, 5, entry.speed);
  const sizeInput = createNumberSelect(0, 5, entry.size);
  const riskInput = createNumberSelect(0, 5, entry.risk);
  const dateInput = createDateTimeInput(entry.timestamp);
  const previousTimestamp = entry.timestamp;

  appendField(card, "Speed", speedInput);
  appendField(card, "Size", sizeInput);
  appendField(card, "Risiko", riskInput);
  appendField(card, "Datum & Uhrzeit", dateInput);

  const foodNameInput = document.createElement("input");
  foodNameInput.type = "text";
  foodNameInput.value = entry.foodName || "";
  appendField(card, "Essen", foodNameInput);

  const foodTagsInput = document.createElement("input");
  foodTagsInput.type = "text";
  foodTagsInput.value = Array.isArray(entry.foodTags) ? entry.foodTags.join(", ") : "";
  appendField(card, "Zutaten", foodTagsInput);

  card.appendChild(createButton("Speichern", () => {
    entry.foodName = foodNameInput.value.trim();
    entry.foodTags = parseTagList(foodTagsInput.value);
    entry.speed = parseInt(speedInput.value, 10);
    entry.size = parseInt(sizeInput.value, 10);
    entry.risk = parseInt(riskInput.value, 10);
    updateEntryTimestamp(entry, dateInput);
    records[entryIndex] = entry;
    refreshEditedEntry(records, previousTimestamp, entry);
  }));
}

function editEntry(timestamp, event) {
  const records = getRecords();
  const entryIndex = getEntryIndexByTimestamp(records, timestamp);
  if (entryIndex === -1) return;

  const entry = records[entryIndex];
  const card = resolveCard(event, timestamp);
  if (!card) return;

  card.innerHTML = "";

  const title = document.createElement("h3");
  title.textContent = `Bearbeiten: ${new Date(entry.timestamp).toLocaleString()}`;
  card.appendChild(title);

  if (entry.type === "symptoms") {
    renderSymptomsEditor(card, entry, records, entryIndex);
  } else if (entry.type === "bm") {
    renderBmEditor(card, entry, records, entryIndex);
  } else if (entry.type === "food_log") {
    renderFoodEditor(card, entry, records, entryIndex);
  }
}

function deleteEntry(timestamp, event) {
  const records = getRecords();
  const entryIndex = getEntryIndexByTimestamp(records, timestamp);
  if (entryIndex === -1) return;

  const card = resolveCard(event, timestamp);
  if (!card) return;

  if (confirm("Möchtest du diesen Eintrag wirklich löschen?")) {
    records.splice(entryIndex, 1);
    saveAndRefreshRecords(records);
  }
}

function setScaleButtons(containerId, hiddenInputId, initial = 0) {
  const container = byId(containerId);
  const hidden = byId(hiddenInputId);
  if (!container || !hidden) return;

  container.innerHTML = "";
  for (let value = 1; value <= 5; value++) {
    const button = document.createElement("button");
    button.textContent = value;
    button.type = "button";
    button.onclick = () => {
      const isSelected = button.classList.contains("selected");
      if (isSelected) {
        hidden.value = 0;
        button.classList.remove("selected");
      } else {
        hidden.value = value;
        container.querySelectorAll("button").forEach(item => item.classList.remove("selected"));
        button.classList.add("selected");
      }
    };
    container.appendChild(button);
  }

  hidden.value = initial;
}

function resetScaleGroup(containerId, hiddenInputId, value = 0) {
  const container = byId(containerId);
  const hidden = byId(hiddenInputId);
  if (!container || !hidden) return;

  hidden.value = value;
  container.querySelectorAll("button").forEach(button => button.classList.remove("selected"));
}

function resetBristolGroup(value = 0) {
  const container = byId("bristolScale");
  const hidden = byId("bristol");
  if (!container || !hidden) return;

  hidden.value = value;
  container.querySelectorAll("button").forEach(button => button.classList.remove("selected"));
}

function resetSymptomsForm() {
  resetScaleGroup("painScale", "pain", 0);
  resetScaleGroup("bloatingScale", "bloating", 0);
  resetScaleGroup("nauseaScale", "nausea", 0);
  byId("painDate").value = "";
}

function resetBmForm() {
  resetBristolGroup(0);
  byId("evacuation").value = "partial";
  resetScaleGroup("pressureScale", "pressure", 0);
  resetScaleGroup("wetnessScale", "wetness", 0);
  byId("bmDate").value = "";
}

function resetFoodForm() {
  resetScaleGroup("speedScale", "speed", 0);
  resetScaleGroup("sizeScale", "size", 0);
  resetScaleGroup("riskScale", "risk", 0);
  lastSelectedFoodSuggestion = "";
  lastSelectedTagSuggestion = "";
  byId("foodText").value = "";
  byId("tags").value = "";
  byId("foodDate").value = "";
  hideFoodSuggestions();
  hideTagSuggestions();
}

function initScales() {
  setScaleButtons("painScale", "pain", 0);
  setScaleButtons("bloatingScale", "bloating", 0);
  setScaleButtons("nauseaScale", "nausea", 0);
  setScaleButtons("pressureScale", "pressure", 0);
  setScaleButtons("wetnessScale", "wetness", 0);
  setScaleButtons("speedScale", "speed", 0);
  setScaleButtons("sizeScale", "size", 0);
  setScaleButtons("riskScale", "risk", 0);
  initBristolScale();
}

function initBristolScale() {
  const container = byId("bristolScale");
  const hidden = byId("bristol");
  if (!container || !hidden) return;

  container.innerHTML = "";
  for (let value = 1; value <= 7; value++) {
    const button = document.createElement("button");
    button.type = "button";

    const image = document.createElement("img");
    image.src = `${value}.png`;
    image.alt = `Bristol ${value}`;
    image.className = "bristol-icon";
    button.appendChild(image);

    const label = document.createElement("div");
    label.className = "value";
    button.appendChild(label);

    button.onclick = () => {
      const isSelected = button.classList.contains("selected");

      if (isSelected) {
        hidden.value = 0;
        button.classList.remove("selected");
      } else {
        hidden.value = value;
        container.querySelectorAll("button").forEach(item => item.classList.remove("selected"));
        button.classList.add("selected");
      }
    };

    container.appendChild(button);
  }

  hidden.value = 0;
}

function savePainBloating() {
  const date = byId("painDate").value || new Date().toISOString();
  const record = {
    type: "symptoms",
    timestamp: date,
    createdAt: new Date().toISOString(),
    pain: parseInt(byId("pain").value, 10),
    bloating: parseInt(byId("bloating").value, 10),
    nausea: parseInt(byId("nausea").value, 10)
  };

  const records = getRecords();
  records.push(record);
  saveRecords(records);
  renderUnifiedLog("log");
  resetSymptomsForm();
}

function saveBM() {
  const date = byId("bmDate").value || new Date().toISOString();
  const record = {
    type: "bm",
    timestamp: date,
    createdAt: new Date().toISOString(),
    bristolScale: parseInt(byId("bristol").value, 10),
    evacuation: byId("evacuation").value,
    pressure: parseInt(byId("pressure").value, 10),
   // wetness: parseInt(byId("wetness").value, 10)
  };

  const records = getRecords();
  records.push(record);
  saveRecords(records);
  renderUnifiedLog("log");
  resetBmForm();
}

function saveFood() {
  const date = byId("foodDate").value || new Date().toISOString();
  const name = byId("foodText").value.trim();
  const tags = parseTagList(byId("tags").value);
  const speed = parseInt(byId("speed").value, 10);
  const size = parseInt(byId("size").value, 10);
  const risk = parseInt(byId("risk").value, 10);

  if (!name) {
    alert("Bitte gib einen Essenamen ein.");
    return;
  }

  const foods = getFoods();
  let food = foods.find(item => item.name.toLowerCase() === name.toLowerCase());
  if (!food) {
    food = {
      id: generateId(),
      name,
      tags,
      createdAt: new Date().toISOString()
    };
    foods.push(food);
  } else {
    food.tags = tags;
  }
  saveFoods(foods);

  const record = {
    type: "food_log",
    timestamp: date,
    createdAt: new Date().toISOString(),
    foodName: name,
    foodTags: tags,
    speed,
    size,
    risk
  };

  const records = getRecords();
  records.push(record);
  saveRecords(records);

  renderUnifiedLog("log");
  resetFoodForm();
}

function initApp() {
  if (appInitialized) return;
  appInitialized = true;

  ensureManifestLink();
  initNavigation();
  updateFoodSortButton();
  const importInput = byId("importRecordsInput");
  if (importInput) {
    importInput.addEventListener("change", handleImportRecordsSelection);
  }
  document.addEventListener("click", hideFoodSuggestionsOnOutsideClick);
  initScales();
  renderUnifiedLog("log");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initApp);
} else {
  initApp();
}