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

const HISTORY_PAGE_SIZE = 10;

function byId(id) {
  return document.getElementById(id);
}

function readStoredArray(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function writeStoredArray(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function readStoredValue(key, fallback = "") {
  const value = localStorage.getItem(key);
  return value === null ? fallback : value;
}

function writeStoredValue(key, value) {
  localStorage.setItem(key, value);
}

function parseTagList(value) {
  return value
    .split(",")
    .map(tag => tag.trim())
    .filter(Boolean);
}

function createButton(text, onClick, options = {}) {
  const button = document.createElement("button");
  button.type = options.type || "button";
  button.textContent = text;
  if (options.className) button.className = options.className;
  if (options.title) button.title = options.title;
  if (options.ariaLabel) button.setAttribute("aria-label", options.ariaLabel);
  button.onclick = onClick;
  return button;
}

function appendField(container, labelText, control) {
  container.appendChild(document.createTextNode(`${labelText}: `));
  container.appendChild(control);
  container.appendChild(document.createElement("br"));
}

function createNumberSelect(min, max, selectedValue) {
  const select = document.createElement("select");
  for (let value = min; value <= max; value++) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    if (value === selectedValue) option.selected = true;
    select.appendChild(option);
  }
  return select;
}

function createChoiceSelect(options, selectedValue, labelMap = {}) {
  const select = document.createElement("select");
  options.forEach(value => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = labelMap[value] || value;
    if (value === selectedValue) option.selected = true;
    select.appendChild(option);
  });
  return select;
}

function formatLocalDateTimeValue(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";

  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}T${padNumber(date.getHours())}:${padNumber(date.getMinutes())}`;
}

function createDateTimeInput(timestamp) {
  const input = document.createElement("input");
  input.type = "datetime-local";
  input.value = formatLocalDateTimeValue(timestamp);
  return input;
}

function updateEntryTimestamp(entry, dateInput) {
  if (!dateInput.value) return;

  const updatedTimestamp = new Date(dateInput.value).toISOString();
  if (updatedTimestamp !== entry.timestamp) {
    entry.timestamp = updatedTimestamp;
  }
}

function createCardActions(actionsConfig) {
  const actions = document.createElement("div");
  actions.className = "card-actions";

  actionsConfig.forEach(config => {
    actions.appendChild(createButton(config.text, config.onClick, config.options));
  });

  return actions;
}

function buildTagContainer(tags, showAllTags) {
  const cleanTags = Array.isArray(tags) ? tags.filter(Boolean) : [];
  if (cleanTags.length === 0) return null;

  const tagsDiv = document.createElement("div");
  const visibleTags = showAllTags ? cleanTags : cleanTags.slice(0, 5);

  visibleTags.forEach(tag => {
    const span = document.createElement("span");
    span.className = "tag";
    span.textContent = tag;
    tagsDiv.appendChild(span);
  });

  if (!showAllTags && cleanTags.length > 5) {
    const span = document.createElement("span");
    span.className = "tag";
    span.textContent = "...";
    tagsDiv.appendChild(span);
  }

  return tagsDiv;
}

function compareFoodNames(foodA, foodB) {
  const nameA = (foodA?.name || "").trim();
  const nameB = (foodB?.name || "").trim();
  const nameComparison = nameA.localeCompare(nameB, "de", { sensitivity: "base" });

  if (nameComparison !== 0) {
    return nameComparison;
  }

  return new Date(foodA?.createdAt || 0) - new Date(foodB?.createdAt || 0);
}

function compareFoodNewestFirst(foodA, foodB) {
  return new Date(foodB?.createdAt || 0) - new Date(foodA?.createdAt || 0);
}

function getFoodSortMode() {
  const sortMode = readStoredValue(STORAGE_KEYS.foodSortMode, FOOD_SORT_MODES.name);
  return Object.values(FOOD_SORT_MODES).includes(sortMode) ? sortMode : FOOD_SORT_MODES.name;
}

function setFoodSortMode(sortMode) {
  const nextSortMode = Object.values(FOOD_SORT_MODES).includes(sortMode) ? sortMode : FOOD_SORT_MODES.name;
  writeStoredValue(STORAGE_KEYS.foodSortMode, nextSortMode);
}

function getNextFoodSortMode(sortMode) {
  return sortMode === FOOD_SORT_MODES.name ? FOOD_SORT_MODES.newest : FOOD_SORT_MODES.name;
}

function getFoodSortButtonLabel(sortMode) {
  return sortMode === FOOD_SORT_MODES.newest ? "Sortierung: Neueste" : "Sortierung: Name";
}

function updateFoodSortButton() {
  const sortButton = byId("foodSortToggle");
  if (!sortButton) return;

  const sortMode = getFoodSortMode();
  sortButton.textContent = getFoodSortButtonLabel(sortMode);
  sortButton.setAttribute("aria-label", getFoodSortButtonLabel(sortMode));
  sortButton.title = `Aktuell ${getFoodSortButtonLabel(sortMode)}`;
}

function toggleFoodSortMode() {
  const nextSortMode = getNextFoodSortMode(getFoodSortMode());
  setFoodSortMode(nextSortMode);
  renderSavedFoods();
}

function getSortedFoods() {
  const sortMode = getFoodSortMode();
  const foods = getFoods();

  if (sortMode === FOOD_SORT_MODES.newest) {
    return foods.sort(compareFoodNewestFirst);
  }

  return foods.sort(compareFoodNames);
}

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

function findFoodCard(foodId) {
  const savedFoodsList = byId("savedFoodsList");
  if (!savedFoodsList) return null;

  return Array.from(savedFoodsList.querySelectorAll(".card")).find(card => card.dataset.foodId === String(foodId)) || null;
}

function getLocalDateParts(timestamp) {
  const date = new Date(timestamp);
  return {
    year: date.getFullYear(),
    month: date.getMonth(),
    day: date.getDate()
  };
}

function getLocalDateKey(timestamp) {
  const parts = getLocalDateParts(timestamp);
  return `${parts.year}-${padNumber(parts.month + 1)}-${padNumber(parts.day)}`;
}

function getMonthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatHistoryMonthLabel(date) {
  return date.toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric"
  });
}

function getHistoryCalendarDayName(index) {
  return ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"][index];
}

function buildDaySeveritySummary(dayInfo) {
  if (!dayInfo || dayInfo.totalEntries === 0) {
    return "Keine Einträge";
  }

  const details = [];
  if (dayInfo.painLowCount > 0) details.push(`${dayInfo.painLowCount}× Bauchweh 1`);
  if (dayInfo.painVeryHighCount > 0) details.push(`${dayInfo.painVeryHighCount}× Bauchweh ≥4`);
  if (dayInfo.painHighCount > 0) details.push(`${dayInfo.painHighCount}× Bauchweh 3`);
  if (dayInfo.painMediumCount > 0) details.push(`${dayInfo.painMediumCount}× Bauchweh 2`);
  if (dayInfo.bristolVeryHighCount > 0) details.push(`${dayInfo.bristolVeryHighCount}× Poopie ≥6`);
  if (dayInfo.bristolHighCount > 0) details.push(`${dayInfo.bristolHighCount}× Poopie 1`);
  if (dayInfo.bristolMediumCount > 0) details.push(`${dayInfo.bristolMediumCount}× Poopie 2/5`);
  if (details.length === 0) details.push("Unauffällig");
  return details.join(" | ");
}

function classifyDaySeverity(dayInfo) {
  if (!dayInfo || dayInfo.totalEntries === 0) {
    return "neutral";
  }

  if (dayInfo.painVeryHighCount >= 2 || dayInfo.bristolVeryHighCount >= 4 || dayInfo.score >= 9) {
    return "very-severe";
  }

  if (
    dayInfo.painVeryHighCount >= 1 ||
    dayInfo.painHighCount >= 2 ||
    dayInfo.bristolVeryHighCount >= 2 ||
    (dayInfo.bristolVeryHighCount >= 1 && (dayInfo.painHighCount >= 1 || dayInfo.painMediumCount >= 1 || dayInfo.painVeryHighCount >= 1)) ||
    dayInfo.bristolMediumCount >= 3 ||
    dayInfo.score >= 6
  ) {
    return "severe";
  }

  if (
    dayInfo.painHighCount >= 1 ||
    dayInfo.bristolVeryHighCount >= 1 ||
    (dayInfo.bristolHighCount >= 1 && (dayInfo.painLowCount >= 1 || dayInfo.painMediumCount >= 1 || dayInfo.painHighCount >= 1 || dayInfo.painVeryHighCount >= 1)) ||
    dayInfo.painMediumCount >= 2 ||
    dayInfo.bristolMediumCount >= 1 ||
    dayInfo.score >= 3
  ) {
    return "medium";
  }

  if (dayInfo.painLowCount >= 1 || dayInfo.painMediumCount >= 1 || dayInfo.bristolHighCount >= 1 || dayInfo.score > 0) {
    return "mild";
  }

  return "neutral";
}

function buildHistoryDayMap(records) {
  const dayMap = new Map();

  records.forEach(record => {
    if (!record || !record.timestamp) return;

    const key = getLocalDateKey(record.timestamp);
    if (!dayMap.has(key)) {
      dayMap.set(key, {
        totalEntries: 0,
        painLowCount: 0,
        painVeryHighCount: 0,
        painHighCount: 0,
        painMediumCount: 0,
        bristolVeryHighCount: 0,
        bristolHighCount: 0,
        bristolMediumCount: 0,
        score: 0
      });
    }

    const dayInfo = dayMap.get(key);
    dayInfo.totalEntries += 1;

    if (record.type === "symptoms") {
      const pain = parseNumberValue(record.pain, 0);
      const bloating = parseNumberValue(record.bloating, 0);

      if (pain >= 4) {
        dayInfo.painVeryHighCount += 1;
        dayInfo.score += 4;
      } else if (pain >= 3) {
        dayInfo.painHighCount += 1;
        dayInfo.score += 2;
      } else if (pain === 2) {
        dayInfo.painMediumCount += 1;
        dayInfo.score += 1;
      } else if (pain === 1) {
        dayInfo.painLowCount += 1;
        dayInfo.score += 0.5;
      }

      if (bloating >= 3) {
        dayInfo.score += 1;
      } else if (bloating === 2) {
        dayInfo.score += 0.5;
      }
    }

    if (record.type === "bm") {
      const bristol = parseNumberValue(record.bristolScale, 0);
      if (bristol >= 6) {
        dayInfo.bristolVeryHighCount += 1;
        dayInfo.score += 3;
      }

      if (bristol === 1) {
        dayInfo.bristolHighCount += 1;
        dayInfo.score += 3;
      }
      else if (bristol === 2 || bristol === 5)  {
       dayInfo.bristolMediumCount += 1;
        dayInfo.score += 2;
      } 
      
    }
  });

  return dayMap;
}

function createCalendarDayCell(label, className) {
  const cell = document.createElement("div");
  cell.className = className;
  cell.textContent = label;
  return cell;
}

function getHistoryRecordsForSelectedDay() {
  const records = getHistorySortedRecords();
  if (!historyCalendarVisible) {
    return records;
  }

  if (!historySelectedDateKey) {
    return [];
  }

  return records
    .filter(record => getLocalDateKey(record.timestamp) === historySelectedDateKey)
    .sort(compareRecordTimestampsAscending);
}

function resetHistoryVisibleCount() {
  historyVisibleCount = HISTORY_PAGE_SIZE;
}

function loadMoreHistoryEntries() {
  historyVisibleCount += HISTORY_PAGE_SIZE;
  renderHistoryLog();
}

function getHistoryEmptyMessage() {
  if (historyCalendarVisible && !historySelectedDateKey) {
    return "Wähle einen Tag im Kalender aus.";
  }

  if (historyCalendarVisible && historySelectedDateKey) {
    return "Keine Einträge für diesen Tag.";
  }

  return "Noch keine Einträge vorhanden.";
}

function renderHistoryCalendar() {
  const container = byId("historyCalendarContainer");
  const grid = byId("historyCalendarGrid");
  const monthLabel = byId("historyCalendarMonthLabel");
  const toggleButton = byId("historyCalendarToggle");
  if (!container || !grid || !monthLabel || !toggleButton) return;

  container.style.display = historyCalendarVisible ? "block" : "none";
  toggleButton.classList.toggle("active", historyCalendarVisible);
  if (!historyCalendarVisible) return;

  const monthDate = getMonthStart(historyCalendarDate);
  historyCalendarDate = monthDate;
  monthLabel.textContent = formatHistoryMonthLabel(monthDate);
  grid.innerHTML = "";

  for (let dayIndex = 0; dayIndex < 7; dayIndex++) {
    const dayNameCell = createCalendarDayCell(getHistoryCalendarDayName(dayIndex), "calendar-cell calendar-weekday");
    grid.appendChild(dayNameCell);
  }

  const records = getRecords();
  const dayMap = buildHistoryDayMap(records);
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const daysInMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const leadingEmptyDays = (firstDay.getDay() + 6) % 7;

  for (let index = 0; index < leadingEmptyDays; index++) {
    grid.appendChild(createCalendarDayCell("", "calendar-cell calendar-day is-empty"));
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const cell = document.createElement("div");
    const dateKey = `${monthDate.getFullYear()}-${padNumber(monthDate.getMonth() + 1)}-${padNumber(day)}`;
    const dayInfo = dayMap.get(dateKey) || { totalEntries: 0, painLowCount: 0, painVeryHighCount: 0, painHighCount: 0, painMediumCount: 0, bristolVeryHighCount: 0, bristolHighCount: 0, bristolMediumCount: 0, score: 0 };
    const severity = classifyDaySeverity(dayInfo);

    cell.className = `calendar-cell calendar-day severity-${severity}`;
    if (historySelectedDateKey === dateKey) {
      cell.classList.add("is-selected");
    }

    const dayNumber = document.createElement("div");
    dayNumber.className = "calendar-day-number";
    dayNumber.textContent = day;
    cell.appendChild(dayNumber);

    if (dayInfo.totalEntries > 0) {
      const meta = document.createElement("div");
      meta.className = "calendar-day-meta";
      meta.textContent = `${dayInfo.totalEntries}×`;
      cell.appendChild(meta);
    }

    cell.title = buildDaySeveritySummary(dayInfo);
    cell.onclick = () => {
      historySelectedDateKey = historySelectedDateKey === dateKey ? null : dateKey;
      resetHistoryVisibleCount();
      renderHistoryCalendar();
      renderHistoryLog();
    };
    grid.appendChild(cell);
  }
}

function toggleHistoryCalendar() {
  historyCalendarVisible = !historyCalendarVisible;
  if (!historyCalendarVisible) {
    historySelectedDateKey = null;
  }
  resetHistoryVisibleCount();
  renderHistoryCalendar();
  renderHistoryLog();
}

function changeHistoryCalendarMonth(offset) {
  historyCalendarDate = new Date(historyCalendarDate.getFullYear(), historyCalendarDate.getMonth() + offset, 1);
  renderHistoryCalendar();
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

function getFoodSuggestions(value, foods) {
  const uniqueNames = Array.from(new Set(foods.map(food => food.name)));

  if (!value) {
    const recentNames = [];
    for (let index = foods.length - 1; index >= 0 && recentNames.length < 4; index--) {
      const name = foods[index].name;
      if (name && !recentNames.includes(name)) {
        recentNames.push(name);
      }
    }
    return recentNames;
  }

  return uniqueNames.filter(name => name.toLowerCase().includes(value));
}

function hideFoodSuggestions() {
  const suggestionsDiv = byId("foodSuggestions");
  if (!suggestionsDiv) return;

  suggestionsDiv.style.display = "none";
  suggestionsDiv.innerHTML = "";
}

function applyFoodSuggestionSelection(name, foods) {
  const input = byId("foodText");
  const tagsInput = byId("tags");
  if (!input) return;

  input.value = name;
  lastSelectedFoodSuggestion = name.trim().toLowerCase();

  const selectedFood = foods.find(food => food.name.toLowerCase() === name.toLowerCase());
  if (selectedFood && selectedFood.tags && tagsInput) {
    tagsInput.value = selectedFood.tags.filter(Boolean).join(", ");
  }

  hideFoodSuggestions();
  input.blur();
}

function showFoodSuggestions() {
  const input = byId("foodText");
  const suggestionsDiv = byId("foodSuggestions");
  if (!input || !suggestionsDiv) return;

  const value = input.value.trim().toLowerCase();
  if (value !== lastSelectedFoodSuggestion) {
    lastSelectedFoodSuggestion = "";
  }

  if (value && value === lastSelectedFoodSuggestion) {
    hideFoodSuggestions();
    return;
  }

  const foods = getFoods().filter(food => food.name && food.name.trim() !== "");
  const suggestions = getFoodSuggestions(value, foods);

  if (suggestions.length === 0) {
    hideFoodSuggestions();
    return;
  }

  suggestionsDiv.innerHTML = "";
  suggestions.forEach(name => {
    const item = document.createElement("div");
    item.className = "suggestion-item";
    item.textContent = name;
    item.onpointerdown = function(event) {
      event.preventDefault();
      applyFoodSuggestionSelection(name, foods);
    };
    suggestionsDiv.appendChild(item);
  });

  suggestionsDiv.style.display = "block";
}

function hideFoodSuggestionsOnOutsideClick(event) {
  const suggestionsDiv = byId("foodSuggestions");
  const input = byId("foodText");
  if (!suggestionsDiv || !input) return;

  if (event.target !== input && !suggestionsDiv.contains(event.target)) {
    hideFoodSuggestions();
  }
}

function createFoodCard(food) {
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.foodId = String(food.id);

  const title = document.createElement("h3");
  title.textContent = food.name || "Essen";
  card.appendChild(title);

  const detailsDiv = document.createElement("div");
  detailsDiv.className = "labels";
  const details = [];
  if (Array.isArray(food.tags) && food.tags.length > 0) {
    details.push(`Zutaten: ${food.tags.filter(Boolean).join(", ")}`);
  }
  detailsDiv.textContent = details.join(" | ");
  card.appendChild(detailsDiv);

  card.appendChild(createCardActions([
    {
      text: "✏",
      onClick: event => editFoodItem(food.id, event),
      options: { title: "Bearbeiten", ariaLabel: "Bearbeiten" }
    },
    {
      text: "X",
      onClick: () => deleteFoodItem(food.id)
    }
  ]));

  return card;
}

function renderSavedFoods() {
  const savedFoodsList = byId("savedFoodsList");
  if (!savedFoodsList) return;

  updateFoodSortButton();

  savedFoodsList.innerHTML = "";
  const foods = getSortedFoods();

  if (foods.length === 0) {
    savedFoodsList.textContent = "Noch keine Essen gespeichert.";
    return;
  }

  foods.forEach(food => {
    savedFoodsList.appendChild(createFoodCard(food));
  });
}

function editFoodItem(foodId, event) {
  const foods = getFoods();
  const foodIndex = foods.findIndex(food => food.id === foodId);
  if (foodIndex === -1) return;

  const food = foods[foodIndex];
  const currentCard = event && event.target ? event.target.closest(".card") : findFoodCard(foodId);
  if (!currentCard) return;

  const card = document.createElement("div");
  card.className = "card";
  card.dataset.foodId = String(food.id);

  const title = document.createElement("h3");
  title.textContent = "Food bearbeiten";
  card.appendChild(title);

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.value = food.name || "";
  appendField(card, "Name", nameInput);

  const tagsInput = document.createElement("input");
  tagsInput.type = "text";
  tagsInput.value = Array.isArray(food.tags) ? food.tags.join(", ") : "";
  appendField(card, "Zutaten", tagsInput);

  card.appendChild(createButton("Speichern", () => {
    const updatedName = nameInput.value.trim();
    if (!updatedName) {
      alert("Essen braucht einen Namen.");
      return;
    }

    foods[foodIndex].name = updatedName;
    foods[foodIndex].tags = parseTagList(tagsInput.value);
    saveFoods(foods);
    renderSavedFoods();
  }));

  card.appendChild(createButton("Abbrechen", () => {
    card.replaceWith(createFoodCard(food));
  }, {
    className: "secondary-button"
  }));

  currentCard.replaceWith(card);
}

function deleteFoodItem(foodId) {
  if (!confirm("Möchtest du dieses Food wirklich löschen?")) return;

  const remainingFoods = getFoods().filter(food => food.id !== foodId);
  saveFoods(remainingFoods);
  renderSavedFoods();
}

function renderHistoryLog() {
  renderUnifiedLog("historyLog", {
    records: getHistoryRecordsForSelectedDay(),
    emptyMessage: getHistoryEmptyMessage(),
    maxItems: historyVisibleCount,
    onLoadMore: loadMoreHistoryEntries,
    loadMoreLabel: "mehr laden"
  });
  renderHistoryCalendar();
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js");
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

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function padNumber(value) {
  return String(value).padStart(2, "0");
}

function formatRecordForExport(record) {
  const exportedRecord = {
    type: record.type,
    timestamp: record.timestamp
  };

  if (record.type === "food_log") {
    const foodName = record.foodName || record.text || "";
    const foodTags = Array.isArray(record.foodTags) ? record.foodTags.filter(Boolean) : [];
    if (record.speed && record.speed !== 0) exportedRecord.speed = record.speed;
    if (foodTags.length > 0) exportedRecord.tags = foodTags;
    exportedRecord.text = foodName || "";
    if (record.size && record.size !== 0) exportedRecord.size = record.size;
    if (record.risk !== undefined && record.risk !== 0) exportedRecord.risk = record.risk;
  } else if (record.type === "bm") {
    exportedRecord.tags = Array.isArray(record.tags) ? record.tags.filter(Boolean) : [];
    exportedRecord["bristol-scale"] = record.bristolScale;
    exportedRecord.evacuation = record.evacuation;
    if (record.wetness && record.wetness !== 0) exportedRecord.wetness = record.wetness;
    if (record.pressure !== undefined && record.pressure !== 0) exportedRecord.pressure = record.pressure;
  } else if (record.type === "symptoms") {
    if (record.pain && record.pain !== 0) exportedRecord.pain = record.pain;
    if (record.bloating && record.bloating !== 0) exportedRecord.bloating = record.bloating;
  }

  return exportedRecord;
}

function parseNumberValue(value, fallback = 0) {
  const parsedValue = Number.parseInt(value, 10);
  return Number.isNaN(parsedValue) ? fallback : parsedValue;
}

function clampNumberValue(value, min, max, fallback = min) {
  const parsedValue = parseNumberValue(value, fallback);
  return Math.min(max, Math.max(min, parsedValue));
}

function normalizeTextValue(value, maxLength = 120) {
  if (value === undefined || value === null) return "";
  return String(value).trim().slice(0, maxLength);
}

function normalizeTagListValue(value, options = {}) {
  const maxTags = options.maxTags || 20;
  const maxTagLength = options.maxTagLength || 30;
  if (!Array.isArray(value)) return [];

  const uniqueTags = [];
  value.forEach(tag => {
    const normalizedTag = normalizeTextValue(tag, maxTagLength);
    if (!normalizedTag || uniqueTags.includes(normalizedTag)) return;
    if (uniqueTags.length < maxTags) {
      uniqueTags.push(normalizedTag);
    }
  });

  return uniqueTags;
}

function normalizeEvacuationValue(value) {
  return value === "full" ? "full" : "partial";
}

function normalizeTimestampValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

function normalizeImportedRecord(record) {
  if (!record || typeof record !== "object") return null;

  const type = record.type;
  const timestamp = normalizeTimestampValue(record.timestamp);
  if (!type || !timestamp) return null;

  if (type === "symptoms") {
    return {
      type,
      timestamp,
      createdAt: timestamp,
      pain: clampNumberValue(record.pain, 0, 5, 0),
      bloating: clampNumberValue(record.bloating, 0, 5, 0)
    };
  }

  if (type === "bm") {
    return {
      type,
      timestamp,
      createdAt: timestamp,
      tags: normalizeTagListValue(record.tags),
      bristolScale: clampNumberValue(record["bristol-scale"] ?? record.bristolScale, 1, 7, 1),
      evacuation: normalizeEvacuationValue(record.evacuation),
      pressure: clampNumberValue(record.pressure, 0, 5, 0),
      wetness: clampNumberValue(record.wetness, 0, 5, 0)
    };
  }

  if (type === "food_log") {
    const foodName = normalizeTextValue(record.foodName || record.text || "", 120);
    return {
      type,
      timestamp,
      createdAt: timestamp,
      foodName,
      foodTags: Array.isArray(record.tags)
        ? normalizeTagListValue(record.tags)
        : normalizeTagListValue(record.foodTags),
      speed: clampNumberValue(record.speed, 0, 5, 0),
      size: clampNumberValue(record.size, 0, 5, 0),
      risk: clampNumberValue(record.risk, 0, 5, 0)
    };
  }

  return null;
}

function getRecordSignature(record) {
  const signatureRecord = formatRecordForExport(record);
  delete signatureRecord.createdAt;
  return JSON.stringify(signatureRecord);
}

function extractImportedRecords(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload["ibs-records"])) return payload["ibs-records"];
  return null;
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
    details.push(`Zutaten: ${visibleTags.join(", ")}${suffix}`);
  }

  return details.join(" | ");
}

function createEntryCard(entry, targetElementId) {
  const card = document.createElement("div");
  card.className = "card";
  card.dataset.entryTimestamp = String(entry.timestamp);

  const title = document.createElement("h3");
  const labels = document.createElement("div");
  labels.className = "labels";
  const date = new Date(entry.timestamp).toLocaleString();
  const showAllTags = targetElementId === "historyLog";

  if (entry.type === "symptoms") {
    title.textContent = `Bauch & Blähungen - ${date}`;
    const pain = entry.pain && entry.pain !== 0 ? `Bauch: ${entry.pain}` : "";
    const bloating = entry.bloating && entry.bloating !== 0 ? `Blähungen: ${entry.bloating}` : "";
    labels.innerHTML = [pain, bloating].filter(Boolean).join(" | ");
  } else if (entry.type === "bm") {
    title.textContent = `Poopie - ${date}`;
    const bristol = `Bristol: ${entry.bristolScale}`;
    const evacuation = `Evacuation: ${entry.evacuation}`;
    const pressure = entry.pressure && entry.pressure !== 0 ? `Druck: ${entry.pressure}` : "";
    const wetness = entry.wetness && entry.wetness !== 0 ? `Nässe: ${entry.wetness}` : "";
    labels.innerHTML = [bristol, evacuation, pressure, wetness].filter(Boolean).join(" | ");
  } else if (entry.type === "food_log") {
    const foodName = entry.foodName || "Essen";
    title.textContent = `${foodName} - ${date}`;
    labels.textContent = buildFoodDetails(entry, showAllTags);
  } else {
    title.textContent = `Eintrag - ${date}`;
  }

  card.appendChild(title);
  card.appendChild(labels);

  if (entry.type === "food_log") {
    const tagsDiv = buildTagContainer(entry.foodTags, showAllTags);
    if (tagsDiv) card.appendChild(tagsDiv);
  }

  if (targetElementId === "historyLog") {
    card.appendChild(createCardActions([
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
  const dateInput = createDateTimeInput(entry.timestamp);
  const previousTimestamp = entry.timestamp;

  appendField(card, "Bauchschmerzen", painInput);
  appendField(card, "Blähungen", bloatingInput);
  appendField(card, "Datum & Uhrzeit", dateInput);

  card.appendChild(createButton("Speichern", () => {
    entry.pain = parseInt(painInput.value, 10);
    entry.bloating = parseInt(bloatingInput.value, 10);
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
  byId("foodText").value = "";
  byId("tags").value = "";
  byId("foodDate").value = "";
  hideFoodSuggestions();
}

function initScales() {
  setScaleButtons("painScale", "pain", 0);
  setScaleButtons("bloatingScale", "bloating", 0);
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
    bloating: parseInt(byId("bloating").value, 10)
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
    wetness: parseInt(byId("wetness").value, 10)
  };

  const records = getRecords();
  records.push(record);
  saveRecords(records);
  renderUnifiedLog("log");
  resetBmForm();
}

function addFoodFromList() {
  const savedFoodsList = byId("savedFoodsList");
  if (!savedFoodsList) return;

  const existingCard = byId("addFoodCard");
  if (existingCard) existingCard.remove();

  const addCard = document.createElement("div");
  addCard.className = "card";
  addCard.id = "addFoodCard";

  const title = document.createElement("h3");
  title.textContent = "Neues Food hinzufügen";
  addCard.appendChild(title);

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.placeholder = "Food Name";
  addCard.appendChild(nameInput);
  addCard.appendChild(document.createElement("br"));

  const tagsInput = document.createElement("input");
  tagsInput.type = "text";
  tagsInput.placeholder = "Zutaten (Komma getrennt)";
  addCard.appendChild(tagsInput);
  addCard.appendChild(document.createElement("br"));

  addCard.appendChild(createButton("Speichern", () => {
    const name = nameInput.value.trim();
    if (!name) {
      alert("Essen braucht einen Namen.");
      return;
    }

    const tags = parseTagList(tagsInput.value);
    const foods = getFoods();
    if (foods.find(food => food.name.toLowerCase() === name.toLowerCase())) {
      alert("Essen existiert bereits.");
      return;
    }

    foods.push({
      id: generateId(),
      name,
      tags,
      createdAt: new Date().toISOString()
    });
    saveFoods(foods);
    addCard.remove();
    renderSavedFoods();
  }));

  addCard.appendChild(createButton("Abbrechen", () => addCard.remove(), {
    className: "secondary-button"
  }));

  savedFoodsList.prepend(addCard);
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