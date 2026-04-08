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

function findFoodCard(foodId) {
  const savedFoodsList = byId("savedFoodsList");
  if (!savedFoodsList) return null;

  return Array.from(savedFoodsList.querySelectorAll(".card")).find(card => card.dataset.foodId === String(foodId)) || null;
}

function normalizeFoodSuggestionText(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("de-DE");
}

function getFoodUsageStats() {
  const usageMap = new Map();

  getRecords()
    .filter(record => record?.type === "food_log" && record.foodName)
    .forEach(record => {
      const key = normalizeFoodSuggestionText(record.foodName);
      if (!key) return;

      const timestamp = new Date(record.timestamp || record.createdAt || 0).getTime();
      const existing = usageMap.get(key);

      if (!existing) {
        usageMap.set(key, {
          count: 1,
          lastUsedAt: Number.isFinite(timestamp) ? timestamp : 0
        });
        return;
      }

      existing.count += 1;
      existing.lastUsedAt = Math.max(existing.lastUsedAt, Number.isFinite(timestamp) ? timestamp : 0);
    });

  return usageMap;
}

function getFoodSuggestions(value, foods, limit = 10) {
  const usageMap = getFoodUsageStats();
  const normalizedQuery = normalizeFoodSuggestionText(value);
  const uniqueFoods = [];
  const seenNames = new Set();

  foods.forEach(food => {
    const name = String(food?.name || "").trim();
    if (!name) return;

    const normalizedName = normalizeFoodSuggestionText(name);
    if (!normalizedName || seenNames.has(normalizedName)) return;

    seenNames.add(normalizedName);
    const usage = usageMap.get(normalizedName) || { count: 0, lastUsedAt: 0 };

    uniqueFoods.push({
      name,
      normalizedName,
      usageCount: usage.count,
      lastUsedAt: usage.lastUsedAt
    });
  });

  if (!normalizedQuery) {
    return uniqueFoods
      .sort((foodA, foodB) => {
        if (foodB.lastUsedAt !== foodA.lastUsedAt) {
          return foodB.lastUsedAt - foodA.lastUsedAt;
        }

        if (foodB.usageCount !== foodA.usageCount) {
          return foodB.usageCount - foodA.usageCount;
        }

        return foodA.name.localeCompare(foodB.name, "de", { sensitivity: "base" });
      })
      .slice(0, limit)
      .map(food => food.name);
  }

  return uniqueFoods
    .filter(food => food.normalizedName.startsWith(normalizedQuery))
    .sort((foodA, foodB) => {
      return foodA.name.localeCompare(foodB.name, "de", { sensitivity: "base" });
    })
    .slice(0, limit)
    .map(food => food.name);
}

function getAllUsedFoodTags() {
  const tagMap = new Map();

  getFoods().forEach(food => {
    if (!Array.isArray(food.tags)) return;

    food.tags.forEach(tag => {
      const normalizedTag = String(tag || "").trim();
      if (!normalizedTag) return;

      const key = normalizedTag.toLowerCase();
      if (!tagMap.has(key)) {
        tagMap.set(key, normalizedTag);
      }
    });
  });

  getRecords().forEach(record => {
    if (record?.type !== "food_log" || !Array.isArray(record.foodTags)) return;

    record.foodTags.forEach(tag => {
      const normalizedTag = String(tag || "").trim();
      if (!normalizedTag) return;

      const key = normalizedTag.toLowerCase();
      if (!tagMap.has(key)) {
        tagMap.set(key, normalizedTag);
      }
    });
  });

  return Array.from(tagMap.values()).sort((tagA, tagB) => tagA.localeCompare(tagB, "de", { sensitivity: "base" }));
}

function getCurrentTagToken(value) {
  const parts = String(value || "").split(",");
  return parts[parts.length - 1].trim().toLowerCase();
}

function getUsedTagSuggestions(value, allTags) {
  const rawValue = String(value || "");
  const currentToken = getCurrentTagToken(rawValue);
  const alreadySelected = new Set(
    rawValue
      .split(",")
      .slice(0, -1)
      .map(tag => tag.trim().toLowerCase())
      .filter(Boolean)
  );

  const availableTags = allTags.filter(tag => !alreadySelected.has(tag.toLowerCase()));

  if (!currentToken) {
    return availableTags.slice(0, 6);
  }

  return availableTags
    .filter(tag => tag.toLowerCase().startsWith(currentToken))
    .sort((tagA, tagB) => tagA.localeCompare(tagB, "de", { sensitivity: "base" }))
    .slice(0, 8);
}

function hideFoodSuggestions() {
  const suggestionsDiv = byId("foodSuggestions");
  if (!suggestionsDiv) return;

  suggestionsDiv.style.display = "none";
  suggestionsDiv.innerHTML = "";
}

function hideTagSuggestions() {
  const suggestionsDiv = byId("tagSuggestions");
  if (!suggestionsDiv) return;

  suggestionsDiv.style.display = "none";
  suggestionsDiv.innerHTML = "";
}

function hideAllFoodSuggestions() {
  hideFoodSuggestions();
  hideTagSuggestions();
}

function moveCursorToEnd(input) {
  if (!input) return;

  const endPosition = input.value.length;
  input.focus();

  if (typeof input.setSelectionRange === "function") {
    input.setSelectionRange(endPosition, endPosition);
  }

  input.scrollLeft = input.scrollWidth;
}

function bindSuggestionItemSelection(item, onSelect) {
  item.addEventListener("pointerdown", event => {
    event.preventDefault();
    event.stopPropagation();
    onSelect();
  });
}

function applyFoodSuggestionSelection(name, foods) {
  const input = byId("foodText");
  const tagsInput = byId("tags");
  if (!input) return;

  input.value = name;
  moveCursorToEnd(input);

  const selectedFood = foods.find(food => food.name.toLowerCase() === name.toLowerCase());
  if (selectedFood && selectedFood.tags && tagsInput) {
    tagsInput.value = selectedFood.tags.filter(Boolean).join(", ");
    moveCursorToEnd(tagsInput);
  }

  hideFoodSuggestions();
}

function showFoodSuggestions() {
  const input = byId("foodText");
  const suggestionsDiv = byId("foodSuggestions");
  if (!input || !suggestionsDiv) return;

  const foods = getFoods().filter(food => food.name && food.name.trim() !== "");
  const suggestions = getFoodSuggestions(input.value, foods, 10);

  if (suggestions.length === 0) {
    hideFoodSuggestions();
    return;
  }

  suggestionsDiv.innerHTML = "";
  suggestions.forEach(name => {
    const item = document.createElement("div");
    item.className = "suggestion-item";
    item.textContent = name;
    bindSuggestionItemSelection(item, () => applyFoodSuggestionSelection(name, foods));
    suggestionsDiv.appendChild(item);
  });

  suggestionsDiv.style.display = "block";
}

function applyTagSuggestionSelection(tag) {
  const input = byId("tags");
  if (!input) return;

  const parts = input.value.split(",");
  const previousTags = parts
    .slice(0, -1)
    .map(item => item.trim())
    .filter(Boolean);

  previousTags.push(tag);
  input.value = `${previousTags.join(", ")}, `;
  moveCursorToEnd(input);

  setTimeout(() => {
    showTagSuggestions();
  }, 0);
}

function showTagSuggestions() {
  const input = byId("tags");
  const suggestionsDiv = byId("tagSuggestions");
  if (!input || !suggestionsDiv) return;

  const allTags = getAllUsedFoodTags();
  const suggestions = getUsedTagSuggestions(input.value, allTags);
  if (suggestions.length === 0) {
    hideTagSuggestions();
    return;
  }

  suggestionsDiv.innerHTML = "";
  suggestions.forEach(tag => {
    const item = document.createElement("div");
    item.className = "suggestion-item";
    item.textContent = tag;
    bindSuggestionItemSelection(item, () => applyTagSuggestionSelection(tag));
    suggestionsDiv.appendChild(item);
  });

  suggestionsDiv.style.display = "block";
}

function hideFoodSuggestionsOnOutsideClick(event) {
  const foodSuggestionsDiv = byId("foodSuggestions");
  const foodInput = byId("foodText");
  if (foodSuggestionsDiv && foodInput && event.target !== foodInput && !foodSuggestionsDiv.contains(event.target)) {
    hideFoodSuggestions();
  }

  const tagSuggestionsDiv = byId("tagSuggestions");
  const tagInput = byId("tags");
  if (tagSuggestionsDiv && tagInput && event.target !== tagInput && !tagSuggestionsDiv.contains(event.target)) {
    hideTagSuggestions();
  }
}

function isScrollInsideSuggestionList(event) {
  const eventTarget = event?.target;
  if (!(eventTarget instanceof Element)) {
    return false;
  }

  return Boolean(eventTarget.closest("#foodSuggestions, #tagSuggestions"));
}

function hideFoodSuggestionsOnScroll(event) {
  if (isScrollInsideSuggestionList(event)) {
    return;
  }

  hideAllFoodSuggestions();
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