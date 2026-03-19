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
      } else if (bristol === 2 || bristol === 5) {
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