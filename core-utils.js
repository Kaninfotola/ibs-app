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

function padNumber(value) {
  return String(value).padStart(2, "0");
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

function supportsPwaFeatures() {
  return window.location.protocol === "https:"
    || window.location.hostname === "localhost"
    || window.location.hostname === "127.0.0.1";
}

function ensureManifestLink() {
  if (!supportsPwaFeatures()) return;
  if (document.querySelector('link[rel="manifest"]')) return;

  const manifestLink = document.createElement("link");
  manifestLink.rel = "manifest";
  manifestLink.href = "manifest.json";
  document.head.appendChild(manifestLink);
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

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
