const MONTHLY_WRAPPED_STORAGE_KEYS = {
  records: "ibs-records",
  shownMonth: "ibs-monthly-wrapped-shown-month"
};

const MONTHLY_WRAPPED_AUTO_SHOW_DAYS = 7;

function readWrappedRecords() {
  try {
    const parsed = JSON.parse(localStorage.getItem(MONTHLY_WRAPPED_STORAGE_KEYS.records));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function getMonthIdentifier(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getPreviousMonthRange(referenceDate = new Date()) {
  const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1);
  const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 0, 23, 59, 59, 999);
  return { start, end };
}

function formatWrappedMonthLabel(date) {
  return date.toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric"
  });
}

function isSameLocalDay(dateA, dateB) {
  return dateA.getFullYear() === dateB.getFullYear()
    && dateA.getMonth() === dateB.getMonth()
    && dateA.getDate() === dateB.getDate();
}

function getLocalDayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getMonthRecords(records, monthRange) {
  return records.filter(record => {
    if (!record || !record.timestamp) return false;
    const timestamp = new Date(record.timestamp);
    if (Number.isNaN(timestamp.getTime())) return false;
    return timestamp >= monthRange.start && timestamp <= monthRange.end;
  });
}

function parseWrappedNumber(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function parseWrappedMetric(value, fallback = 0) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === "string") {
    const normalizedValue = value.replace(",", ".").trim();
    const parsed = Number.parseFloat(normalizedValue);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function formatWrappedDecimal(value) {
  return parseWrappedMetric(value).toLocaleString("de-DE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  });
}

function collectWrappedStats(records, monthRange) {
  const monthRecords = getMonthRecords(records, monthRange);
  const dayMap = new Map();
  const foodCounter = new Map();
  let bmEntryCount = 0;
  let poopCount = 0;
  let foodEntryCount = 0;
  let symptomEntryCount = 0;
  let totalPain = 0;
  let bloatingHeavyCount = 0;
  let nauseaHeavyCount = 0;
  let totalNausea = 0;
  let riskyFoodCount = 0;
  let totalRisk = 0;

  monthRecords.forEach(record => {
    const timestamp = new Date(record.timestamp);
    const dayKey = getLocalDayKey(timestamp);
    if (!dayMap.has(dayKey)) {
      dayMap.set(dayKey, {
        date: new Date(timestamp.getFullYear(), timestamp.getMonth(), timestamp.getDate()),
        entries: 0,
        painValues: [],
        poopCount: 0,
        averagePain: 0,
        maxPain: 0
      });
    }

    const dayInfo = dayMap.get(dayKey);
    dayInfo.entries += 1;

    if (record.type === "bm") {
      bmEntryCount += 1;
      poopCount += 1;
      dayInfo.poopCount += 1;
    }

    if (record.type === "symptoms") {
      const pain = parseWrappedNumber(record.pain, 0);
      const bloating = parseWrappedNumber(record.bloating, 0);
      const nausea = parseWrappedNumber(record.nausea, 0);
      symptomEntryCount += 1;
      totalPain += pain;
      totalNausea += nausea;
      dayInfo.painValues.push(pain);
      dayInfo.maxPain = Math.max(dayInfo.maxPain, pain);
      if (bloating >= 3) {
        bloatingHeavyCount += 1;
      }
      if (nausea >= 3) {
        nauseaHeavyCount += 1;
      }
    }

    if (record.type === "food_log") {
      foodEntryCount += 1;
      const foodName = (record.foodName || "Snack-Geheimnis").trim() || "Snack-Geheimnis";
      foodCounter.set(foodName, (foodCounter.get(foodName) || 0) + 1);
      const risk = parseWrappedNumber(record.risk, 0);
      totalRisk += risk;
      if (risk >= 3) {
        riskyFoodCount += 1;
      }
    }
  });

  const trackedDays = Array.from(dayMap.values()).sort((dayA, dayB) => dayA.date - dayB.date);
  trackedDays.forEach(day => {
    day.averagePain = day.painValues.length > 0
      ? day.painValues.reduce((sum, value) => sum + value, 0) / day.painValues.length
      : 0;
  });
  const poopDays = trackedDays.filter(day => day.poopCount > 0);
  const painFreeDays = trackedDays.filter(day => day.painValues.length > 0 && day.painValues.every(value => value === 0)).length;
  const activeDays = trackedDays.length;
  const averagePain = symptomEntryCount > 0 ? (totalPain / symptomEntryCount) : 0;
  const averageNausea = symptomEntryCount > 0 ? (totalNausea / symptomEntryCount) : 0;
  const averageRisk = foodEntryCount > 0
    ? totalRisk / foodEntryCount
    : 0;
  const averagePoopsPerPoopDay = poopDays.length > 0 ? poopCount / poopDays.length : 0;
  const multiPoopDays = poopDays.filter(day => day.poopCount > 1).length;

  const poopChampionDay = trackedDays.reduce((bestDay, currentDay) => {
    if (!bestDay || currentDay.poopCount > bestDay.poopCount) return currentDay;
    return bestDay;
  }, null);

  const toughestDay = trackedDays.reduce((bestDay, currentDay) => {
    if (!bestDay || currentDay.averagePain > bestDay.averagePain) return currentDay;
    if (currentDay.averagePain === bestDay.averagePain && currentDay.maxPain > bestDay.maxPain) return currentDay;
    return bestDay;
  }, null);

  const sortedFoods = Array.from(foodCounter.entries())
    .sort((entryA, entryB) => {
      if (entryB[1] !== entryA[1]) {
        return entryB[1] - entryA[1];
      }

      return entryA[0].localeCompare(entryB[0], "de", { sensitivity: "base" });
    });
  const topFood = sortedFoods[0] || null;
  const topFoods = sortedFoods.slice(0, 3);

  return {
    monthRecords,
    monthLabel: formatWrappedMonthLabel(monthRange.start),
    bmEntryCount,
    foodEntryCount,
    poopCount,
    poopDaysCount: poopDays.length,
    averagePoopsPerPoopDay,
    multiPoopDays,
    painFreeDays,
    activeDays,
    symptomEntryCount,
    averagePain,
    averageNausea,
    bloatingHeavyCount,
    nauseaHeavyCount,
    riskyFoodCount,
    averageRisk,
    poopChampionDay,
    toughestDay,
    topFood,
    topFoods,
    totalEntries: monthRecords.length
  };
}

function getPoopJoke(stats) {
  if (stats.poopCount === 0) return "Der Darm war im Energiesparmodus. Selbst die Keramik hat dich vermisst.";
  if (stats.poopCount < 5) return "Eher Boutique-Betrieb als Großraumbüro. Sehr exklusiver Stuhlgang-Club.";
  if (stats.poopCount < 15) return "Solide Frequenz. Nicht dramatisch, nicht langweilig — Darm in Mid-Season-Form.";
  if (stats.poopCount < 25) return "Stabil unterwegs. Kein Chaos, kein Winterschlaf, einfach verlässlich in Bewegung.";
  if (stats.poopCount <= 35) return "Fast täglicher Rhythmus — das wirkt schon eher nach gepflegter Darm-Routine als nach Zufall.";
  if (stats.poopCount <= 45) return "Dein Badezimmer hatte diesen Monat Stammgaststatus. VIP-Karte vermutlich schon gestempelt.";
  return "Dein Badezimmer kennt dich inzwischen besser als deine Therapeutin. Und urteilt weniger.";
}

function getPoopCadenceJoke(stats) {
  const averagePoopsPerPoopDay = parseWrappedMetric(stats.averagePoopsPerPoopDay);

  if (averagePoopsPerPoopDay >= 2.5) return "Mehrfach-Sessions waren praktisch Teil des Tagesplans. Die Keramik nickt anerkennend.";
  if (averagePoopsPerPoopDay >= 1.7) return "Mehr als ein Gastspiel pro Klo-Tag, eindeutig Director's Cut statt Kurzauftritt.";
  if (averagePoopsPerPoopDay > 1) return "An Poopie-Tagen lief eher Serienformat als Einzelfolge.";
  return "Immer wieder Nachschlag. Nicht chaotisch, aber definitiv keine One-Hit-Wonder-Monate.";
}

function getPainFreeJoke(stats) {
  if (stats.painFreeDays === 0) return "Bauchi war eher Kritiker als Fanclub. Nächsten Monat bitte weniger Drama, mehr Wellness.";
  if (stats.painFreeDays < 5) return "Ein paar friedliche Tage waren dabei, wie Bonuslevel, nur mit weniger Konfetti.";
  if (stats.painFreeDays < 12) return "Respekt: Dein Bauch hatte mehrere diplomatische Waffenruhen.";
  return "Fast schon Spa-Monat. Bauchi hat offenbar gelegentlich an innere Harmonie geglaubt.";
}

function getFoodJoke(stats) {
  if (!stats.topFood) return "Kulinarisch war das ein Monat voller Geheimhaltung. Der Snack-Geheimdienst ermittelt noch.";
  if (stats.riskyFoodCount === 0) return `${stats.topFood[0]} war häufig am Start und erstaunlich brav. Für Darm-Verhältnisse fast suspekt.`;
  if (stats.averageRisk < 2) return `${stats.topFood[0]} war dein Monatsliebling, charmant, leicht riskant, aber noch keine Red Flag.`;
  return `${stats.topFood[0]} war oft dabei und hatte stellenweise chaotische Energie. Eine toxische Snack-Romanze?`;
}

function getTopFoodsJoke(stats) {
  if (!stats.topFoods || stats.topFoods.length === 0) return "Kulinarisches Ranking vertagt. Die Jury hat keine Snacks erwischt.";
  if (stats.topFoods.length === 1) return `${stats.topFoods[0][0]} hat konkurrenzlos die Bühne übernommen. Monopoly, aber essbar.`;
  if (stats.topFoods.length === 2) return `Ein klares Duo an der Spitze. Fast schon Darm-Charts mit Featurings.`;
  return "Die Top 3 stehen fest. Bauchi präsentiert offiziell die Snack-Charts des Monats.";
}

function getMoodJoke(stats) {
  const averagePain = parseWrappedMetric(stats.averagePain);
  const toughestDayAveragePain = parseWrappedMetric(stats.toughestDay?.averagePain);
  const maxPain = parseWrappedMetric(stats.toughestDay?.maxPain);

  if (!stats.toughestDay || toughestDayAveragePain === 0 || averagePain === 0) {
    return "Es gab keinen echten Bossfight-Tag. Bauchi hat ungewöhnlich friedlich performt.";
  }

  if (averagePain < 1.5) {
    return maxPain >= 4
      ? "Im Schnitt ziemlich ruhig, auch wenn ein einzelner Tag kurz Drama geprobt hat."
      : "Insgesamt eher entspannt. Bauchi hat meistens im Energiesparmodus gearbeitet.";
  }

  if (averagePain < 2.5) {
    return maxPain >= 4
      ? "Im Monatsmittel noch okay, aber mit einem spürbaren Ausreißer nach oben."
      : "Leicht gereizte Mid-Season-Energie, nicht toll, aber auch kein Endgegner-Arc.";
  }

  if (averagePain < 3.5) {
    return "Das war schon eine spürbare Bauch-Staffel mit mehreren Folgen über Wohlfühlniveau.";
  }

  return "Der Monat hatte klare Endgegner-Vibes. Bauchi wollte dramaturgisch offensichtlich alles geben.";
}

function formatWrappedDay(date) {
  if (!date) return "—";
  return date.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit"
  });
}

function buildWrappedCards(stats) {
  const cards = [];

  if (stats.bmEntryCount > 0) {
    cards.push({
      emoji: "🚽",
      title: "Poopie Parade",
      value: `${stats.poopCount}x`,
      meta: stats.poopChampionDay && stats.poopChampionDay.poopCount > 0
        ? `Rekordtag: ${formatWrappedDay(stats.poopChampionDay.date)} mit ${stats.poopChampionDay.poopCount}x`
        : "Kein Rekordtag vorhanden",
      detailLines: stats.averagePoopsPerPoopDay <= 1
        ? [
          `Ø ${formatWrappedDecimal(stats.averagePoopsPerPoopDay)}x pro Poopie-Tag`,
          `${stats.poopDaysCount} Tage mit mindestens einem Log`,
          ...(stats.poopCount >= 28 && stats.poopCount <= 35 ? ["Ziemlich nah an 1x pro Tag — das ist oft ein angenehm stabiler Rhythmus."] : [])
        ]
        : [],
      joke: getPoopJoke(stats)
    });
  }

  if (stats.bmEntryCount > 0 && stats.averagePoopsPerPoopDay > 1) {
    cards.push({
      emoji: "🌀",
      title: "Doppelsitzungen",
      value: `Ø ${formatWrappedDecimal(stats.averagePoopsPerPoopDay)}x/Tag`,
      meta: `${stats.multiPoopDays} Tage mit mehr als einem Poopie-Log`,
      joke: getPoopCadenceJoke(stats)
    });
  }

  if (stats.symptomEntryCount > 0) {
    cards.push({
      emoji: "🫶",
      title: "Schmerzfreie Tage",
      value: `${stats.painFreeDays}`,
      meta: `${stats.activeDays} getrackte Tage im Monat`,
      joke: getPainFreeJoke(stats)
    });
  }

  if (stats.foodEntryCount > 0) {
    cards.push({
      emoji: "🍽️",
      title: "Snack des Monats",
      value: stats.topFood ? stats.topFood[0] : "Mystery Meal",
      meta: stats.topFood ? `${stats.topFood[1]}x gegessen` : "Kein Food-Log vorhanden",
      joke: getFoodJoke(stats)
    });
  }

  if (stats.foodEntryCount > 1 && stats.topFoods.length > 0) {
    cards.push({
      emoji: "🏆",
      title: "Top 3 Essen",
      value: "Snack-Charts",
      meta: `${stats.topFoods.length} Plätze vergeben`,
      detailLines: stats.topFoods.map((foodEntry, index) => `${index + 1}. ${foodEntry[0]} — ${foodEntry[1]}x`),
      joke: getTopFoodsJoke(stats)
    });
  }

  if (stats.symptomEntryCount > 0) {
    cards.push({
      emoji: "🎢",
      title: "Bauch-Mood",
      value: `Ø Schmerz ${formatWrappedDecimal(stats.averagePain)}`,
      meta: stats.toughestDay
        ? `Härtester Tag: ${formatWrappedDay(stats.toughestDay.date)} · Tages-Ø an den Tag ${formatWrappedDecimal(stats.toughestDay.averagePain)}`
        : "Kein härtester Tag",
      joke: getMoodJoke(stats)
    });
  }

  if (stats.symptomEntryCount > 0) {
    cards.push({
      emoji: "🌬️",
      title: "Bläh-Barometer",
      value: `${stats.bloatingHeavyCount}`,
      meta: "Einträge mit Blähungen ≥ 3",
      joke: stats.bloatingHeavyCount === 0
        ? "Luftverkehr überraschend ruhig. Der Tower meldet freie Sicht."
        : stats.bloatingHeavyCount < 5
          ? "Ein paar windige Momente, aber noch kein offizieller Sturmbericht."
          : "Teils böige Lage. Deine innere Wetterapp hätte Warnstufe Gelb geschickt."
    });
  }

  if (stats.symptomEntryCount > 0) {
    cards.push({
      emoji: "🤢",
      title: "Übelkeitsradar",
      value: `Ø ${formatWrappedDecimal(stats.averageNausea)}`,
      meta: `${stats.nauseaHeavyCount} Einträge mit Übelkeit ≥ 3`,
      joke: stats.nauseaHeavyCount === 0
        ? "Magen überraschend gelassen. Das Karussell blieb diesen Monat meist stehen."
        : stats.nauseaHeavyCount < 5
          ? "Ein paar wacklige Momente, aber noch kein offizieller Seegang-Alarm."
          : "Dein Magen wollte stellenweise Achterbahn fahren. Sicherheitsbügel bitte schließen."
    });
  }

  if (stats.foodEntryCount > 0) {
    cards.push({
      emoji: "🎲",
      title: "Risiko-Level",
      value: `Ø ${stats.averageRisk.toFixed(1)}`,
      meta: `${stats.riskyFoodCount} riskante Mahlzeiten (Risiko ≥ 3)`,
      joke: stats.riskyFoodCount === 0
        ? "Kulinarisch erstaunlich vernünftig. Fast schon verdächtig erwachsen."
        : stats.riskyFoodCount < 4
          ? "Ein bisschen Nervenkitzel muss wohl sein. Snack-Casino in homöopathischer Dosis."
          : "Du hast Risiko nicht nur gesehen, du hast es teilweise eingeladen."
    });
  }

  return cards;
}

function createWrappedCardElement(card) {
  const element = document.createElement("article");
  element.className = "monthly-wrapped-card";

  const top = document.createElement("div");
  top.className = "monthly-wrapped-card-top";

  const emoji = document.createElement("span");
  emoji.className = "monthly-wrapped-emoji";
  emoji.textContent = card.emoji;
  top.appendChild(emoji);

  const content = document.createElement("div");

  const title = document.createElement("h3");
  title.textContent = card.title;
  content.appendChild(title);

  const value = document.createElement("div");
  value.className = "monthly-wrapped-value";
  value.textContent = card.value;
  content.appendChild(value);

  const meta = document.createElement("div");
  meta.className = "monthly-wrapped-meta";
  meta.textContent = card.meta;
  content.appendChild(meta);

  if (Array.isArray(card.detailLines) && card.detailLines.length > 0) {
    const detailsList = document.createElement("ul");
    detailsList.className = "monthly-wrapped-detail-list";

    card.detailLines.forEach(detailLine => {
      const item = document.createElement("li");
      item.textContent = detailLine;
      detailsList.appendChild(item);
    });

    content.appendChild(detailsList);
  }

  top.appendChild(content);
  element.appendChild(top);

  const joke = document.createElement("p");
  joke.textContent = card.joke;
  element.appendChild(joke);

  return element;
}

function ensureWrappedModal() {
  let overlay = document.getElementById("monthlyWrappedOverlay");
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.id = "monthlyWrappedOverlay";
  overlay.className = "monthly-wrapped-overlay";
  overlay.hidden = true;

  const dialog = document.createElement("div");
  dialog.className = "monthly-wrapped-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "monthlyWrappedTitle");

  dialog.innerHTML = `
    <div class="monthly-wrapped-header">
      <div>
        <div class="monthly-wrapped-kicker">Bauchi Wrapped</div>
        <h2 id="monthlyWrappedTitle">Dein Monatsrückblick</h2>
        <p id="monthlyWrappedSubtitle" class="monthly-wrapped-subtitle"></p>
      </div>
      <button id="monthlyWrappedClose" class="secondary-button monthly-wrapped-close" type="button" aria-label="Wrapped schließen">✕</button>
    </div>
    <div id="monthlyWrappedIntro" class="monthly-wrapped-intro"></div>
    <div id="monthlyWrappedGrid" class="monthly-wrapped-grid"></div>
    <div class="monthly-wrapped-footer">
      <button id="monthlyWrappedDismiss" type="button">Okay, ich nehme die Lore an</button>
    </div>
  `;

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  const close = () => hideMonthlyWrapped();
  overlay.addEventListener("click", event => {
    if (event.target === overlay) close();
  });
  dialog.querySelector("#monthlyWrappedClose").addEventListener("click", close);
  dialog.querySelector("#monthlyWrappedDismiss").addEventListener("click", close);

  return overlay;
}

function renderMonthlyWrapped(stats) {
  const overlay = ensureWrappedModal();
  const subtitle = overlay.querySelector("#monthlyWrappedSubtitle");
  const intro = overlay.querySelector("#monthlyWrappedIntro");
  const grid = overlay.querySelector("#monthlyWrappedGrid");

  subtitle.textContent = `${stats.monthLabel} in Zahlen, Bauchgefühl und leicht übertriebener Dramatik.`;
  intro.textContent = stats.totalEntries > 0
    ? `Im ${stats.monthLabel} hast du ${stats.totalEntries} Einträge gesammelt. Zeit für den inoffiziell offiziellen Darm-Monatsbericht.`
    : `Für ${stats.monthLabel} gibt es leider keine Daten. Das Wrapped ist diesmal mehr Kunstpause als Report.`;

  grid.innerHTML = "";
  buildWrappedCards(stats).forEach(card => {
    grid.appendChild(createWrappedCardElement(card));
  });
}

function showMonthlyWrapped(stats, options = {}) {
  renderMonthlyWrapped(stats);
  const overlay = ensureWrappedModal();
  overlay.hidden = false;
  document.body.classList.add("monthly-wrapped-open");

  if (options.markAsShown) {
    localStorage.setItem(MONTHLY_WRAPPED_STORAGE_KEYS.shownMonth, getMonthIdentifier(new Date()));
  }
}

function hideMonthlyWrapped() {
  const overlay = document.getElementById("monthlyWrappedOverlay");
  document.body.classList.remove("monthly-wrapped-open");

  if (!overlay) return;
  overlay.hidden = true;
}

function removeMonthlyWrappedOverlay() {
  const overlay = document.getElementById("monthlyWrappedOverlay");
  document.body.classList.remove("monthly-wrapped-open");

  if (!overlay) return;
  overlay.remove();
}

function isWithinMonthlyWrappedAutoShowWindow(date = new Date()) {
  const dayOfMonth = date.getDate();
  return dayOfMonth >= 1 && dayOfMonth <= MONTHLY_WRAPPED_AUTO_SHOW_DAYS;
}

function shouldAutoShowMonthlyWrapped(stats) {
  const now = new Date();
  if (!isWithinMonthlyWrappedAutoShowWindow(now)) {
    return false;
  }

  if (stats.totalEntries === 0) {
    return false;
  }

  const shownMonth = localStorage.getItem(MONTHLY_WRAPPED_STORAGE_KEYS.shownMonth);
  return shownMonth !== getMonthIdentifier(now);
}

function removeMonthlyWrappedButton() {
  const button = document.getElementById("monthlyWrappedButton");
  if (button) {
    button.remove();
  }
}

function addMonthlyWrappedButton(stats) {
  const historyActions = document.querySelector("#historySection .history-actions");
  if (!isWithinMonthlyWrappedAutoShowWindow(new Date())) {
    removeMonthlyWrappedButton();
    return;
  }

  if (!historyActions || document.getElementById("monthlyWrappedButton")) return;

  const button = document.createElement("button");
  button.id = "monthlyWrappedButton";
  button.type = "button";
  button.className = "secondary-button";
  button.textContent = "✨ Wrapped";
  button.addEventListener("click", () => showMonthlyWrapped(stats, { markAsShown: false }));
  historyActions.prepend(button);
}

function initMonthlyWrapped() {
  const monthRange = getPreviousMonthRange(new Date());
  const stats = collectWrappedStats(readWrappedRecords(), monthRange);
  const isAutoShowWindow = isWithinMonthlyWrappedAutoShowWindow(new Date());

  if (isAutoShowWindow) {
    addMonthlyWrappedButton(stats);
  } else {
    removeMonthlyWrappedButton();
  }

  if (shouldAutoShowMonthlyWrapped(stats)) {
    showMonthlyWrapped(stats, { markAsShown: true });
    return;
  }

  if (!isAutoShowWindow) {
    removeMonthlyWrappedOverlay();
    return;
  }

  hideMonthlyWrapped();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initMonthlyWrapped);
} else {
  initMonthlyWrapped();
}
