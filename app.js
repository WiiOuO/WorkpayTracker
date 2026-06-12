const STORAGE_KEY = "workpay-tracker-state-v1";

const state = {
  hourlyRate: "",
  records: [],
  tags: [],
  inputMode: "minutes",
  editingId: null,
  monthFilter: "",
  selectedDay: "",
  selectedTag: "",
  managingTag: "",
  sheetOpen: false,
};

const $ = (id) => document.getElementById(id);
const money = new Intl.NumberFormat("zh-TW", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const shortMoney = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 1 });

const els = {
  hourlyRate: $("hourlyRate"),
  saveRate: $("saveRate"),
  todayPay: $("todayPay"),
  todayMinutes: $("todayMinutes"),
  monthPay: $("monthPay"),
  monthMinutes: $("monthMinutes"),
  totalPay: $("totalPay"),
  totalMinutes: $("totalMinutes"),
  workDate: $("workDate"),
  minutesMode: $("minutesMode"),
  rangeMode: $("rangeMode"),
  directMode: $("directMode"),
  minutesFields: $("minutesFields"),
  rangeFields: $("rangeFields"),
  timePayFields: $("timePayFields"),
  directPayFields: $("directPayFields"),
  minutesInput: $("minutesInput"),
  startTime: $("startTime"),
  endTime: $("endTime"),
  nextDayEnd: $("nextDayEnd"),
  multiplier: $("multiplier"),
  directPay: $("directPay"),
  recordTag: $("recordTag"),
  manageTag: $("manageTag"),
  tagNameInput: $("tagNameInput"),
  addTagButton: $("addTagButton"),
  renameTagButton: $("renameTagButton"),
  deleteTagButton: $("deleteTagButton"),
  tagChips: $("tagChips"),
  tagHint: $("tagHint"),
  tagEmptyHint: $("tagEmptyHint"),
  note: $("note"),
  saveRecord: $("saveRecord"),
  formError: $("formError"),
  recordsList: $("recordsList"),
  recordTemplate: $("recordTemplate"),
  dayGroupTemplate: $("dayGroupTemplate"),
  formTitle: $("formTitle"),
  cancelEdit: $("cancelEdit"),
  installButton: $("installButton"),
  monthFilter: $("monthFilter"),
  filterMonthPay: $("filterMonthPay"),
  filterMonthMinutes: $("filterMonthMinutes"),
  filterHint: $("filterHint"),
  calendarChart: $("calendarChart"),
  clearDayFilter: $("clearDayFilter"),
  openFormButton: $("openFormButton"),
  sheetOverlay: $("sheetOverlay"),
  recordSheet: $("recordSheet"),
};

init();

function init() {
  loadState();
  setDefaults();
  bindEvents();
  render();
  registerServiceWorker();
}

function setDefaults() {
  if (!els.workDate.value) els.workDate.value = todayString();
  if (!els.startTime.value) els.startTime.value = "09:00";
  if (!els.endTime.value) els.endTime.value = "10:00";
  if (!state.monthFilter) state.monthFilter = todayString().slice(0, 7);
  els.monthFilter.value = state.monthFilter;
}

function bindEvents() {
  els.saveRate.addEventListener("click", saveHourlyRate);
  els.hourlyRate.addEventListener("change", saveHourlyRateIfValid);
  els.minutesMode.addEventListener("click", () => setInputMode("minutes"));
  els.rangeMode.addEventListener("click", () => setInputMode("range"));
  els.directMode.addEventListener("click", () => setInputMode("direct"));
  els.saveRecord.addEventListener("click", saveRecord);
  els.cancelEdit.addEventListener("click", closeSheet);
  els.sheetOverlay.addEventListener("click", closeSheet);
  els.openFormButton.addEventListener("click", openNewRecordSheet);
  els.addTagButton.addEventListener("click", addTag);
  els.renameTagButton.addEventListener("click", renameTag);
  els.deleteTagButton.addEventListener("click", deleteTag);
  els.manageTag.addEventListener("change", () => {
    state.managingTag = els.manageTag.value;
    els.tagNameInput.value = state.managingTag;
    updateTagButtons();
  });
  els.clearDayFilter.addEventListener("click", () => {
    state.selectedDay = "";
    renderMonthSection();
    renderRecords();
  });
  els.monthFilter.addEventListener("change", () => {
    state.monthFilter = els.monthFilter.value || todayString().slice(0, 7);
    state.selectedDay = "";
    saveState();
    render();
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.sheetOpen) closeSheet();
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    window.deferredInstallPrompt = event;
    els.installButton.hidden = false;
  });

  els.installButton.addEventListener("click", async () => {
    const prompt = window.deferredInstallPrompt;
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice;
    window.deferredInstallPrompt = null;
    els.installButton.hidden = true;
  });
}

function saveHourlyRate() {
  const rate = positiveNumber(els.hourlyRate.value);
  if (!rate) return showError("請輸入大於 0 的基礎時薪");
  state.hourlyRate = String(rate);
  saveState();
  render();
  showError("");
}

function saveHourlyRateIfValid() {
  const rate = positiveNumber(els.hourlyRate.value);
  if (!rate) return;
  state.hourlyRate = String(rate);
  saveState();
  renderSummaries();
}

function openNewRecordSheet() {
  state.editingId = null;
  clearForm();
  openSheet();
}

function openSheet() {
  state.sheetOpen = true;
  els.recordSheet.hidden = false;
  els.sheetOverlay.hidden = false;
  document.body.classList.add("sheet-is-open");
  renderEditMode();
  renderRecordTagSelect();
  requestAnimationFrame(() => els.recordSheet.classList.add("is-open"));
}

function closeSheet() {
  state.sheetOpen = false;
  state.editingId = null;
  els.recordSheet.classList.remove("is-open");
  document.body.classList.remove("sheet-is-open");
  setTimeout(() => {
    if (state.sheetOpen) return;
    els.recordSheet.hidden = true;
    els.sheetOverlay.hidden = true;
    clearForm();
    showError("");
  }, 180);
}

function setInputMode(mode) {
  state.inputMode = mode;
  renderInputMode();
}

function saveRecord() {
  showError("");
  const date = els.workDate.value;
  if (!date) return showError("請選擇日期");

  const payMode = state.inputMode === "direct" ? "direct" : "time";
  const basePayload = {
    id: state.editingId ?? Date.now(),
    date,
    tag: cleanTagName(els.recordTag.value),
    note: els.note.value.trim(),
    payMode,
  };

  let payload;
  if (payMode === "direct") {
    const directPay = positiveNumber(els.directPay.value);
    if (!directPay) return showError("請輸入大於 0 的直接薪水");
    payload = {
      ...basePayload,
      minutes: 0,
      timeRange: "",
      nextDayEnd: false,
      hourlyRate: 0,
      multiplier: 1,
      directPay,
      mode: "direct",
    };
  } else {
    const hourlyRate = positiveNumber(els.hourlyRate.value);
    if (!hourlyRate) return showError("請先輸入大於 0 的基礎時薪");
    const multiplier = positiveNumber(els.multiplier.value);
    if (!multiplier) return showError("倍率必須大於 0");
    const duration = readDuration();
    if (!duration.ok) return showError(duration.error);
    state.hourlyRate = String(hourlyRate);
    payload = {
      ...basePayload,
      minutes: duration.minutes,
      timeRange: duration.timeRange,
      nextDayEnd: duration.nextDayEnd,
      hourlyRate,
      multiplier,
      directPay: 0,
      mode: state.inputMode,
    };
  }

  state.monthFilter = date.slice(0, 7);
  state.selectedDay = date;

  if (state.editingId) {
    state.records = state.records.map((record) => record.id === state.editingId ? payload : record);
  } else {
    state.records.unshift(payload);
  }

  saveState();
  closeSheet();
  render();
}

function readDuration() {
  if (state.inputMode === "minutes") {
    const minutes = positiveInteger(els.minutesInput.value);
    if (!minutes) return { ok: false, error: "請輸入大於 0 的工作分鐘" };
    return { ok: true, minutes, timeRange: "", nextDayEnd: false };
  }

  const start = parseTime(els.startTime.value);
  const end = parseTime(els.endTime.value);
  const nextDayEnd = els.nextDayEnd.checked;
  if (start == null || end == null) return { ok: false, error: "請輸入開始與結束時間" };
  const adjustedEnd = nextDayEnd ? end + 24 * 60 : end;
  if (adjustedEnd <= start) return { ok: false, error: "結束時間必須晚於開始時間，跨日請勾選隔日" };
  return {
    ok: true,
    minutes: adjustedEnd - start,
    timeRange: `${els.startTime.value} - ${nextDayEnd ? "隔日 " : ""}${els.endTime.value}`,
    nextDayEnd,
  };
}

function editRecord(id) {
  const record = normalizeRecord(state.records.find((item) => item.id === id));
  if (!record) return;

  state.editingId = id;
  state.inputMode = record.payMode === "direct" ? "direct" : (record.mode || (record.timeRange ? "range" : "minutes"));
  els.workDate.value = record.date;
  els.hourlyRate.value = record.hourlyRate || state.hourlyRate || "";
  els.multiplier.value = record.multiplier || 1;
  els.directPay.value = record.directPay || "";
  els.note.value = record.note || "";
  els.minutesInput.value = "";
  renderRecordTagSelect();
  els.recordTag.value = record.tag || "";

  if (state.inputMode === "minutes") {
    els.minutesInput.value = record.minutes;
  } else if (state.inputMode === "range") {
    const [start, rawEnd] = (record.timeRange || "09:00 - 10:00").split(" - ");
    const end = rawEnd || "10:00";
    els.startTime.value = start || "09:00";
    els.nextDayEnd.checked = Boolean(record.nextDayEnd) || end.startsWith("隔日 ");
    els.endTime.value = end.replace("隔日 ", "");
  }

  renderInputMode();
  openSheet();
}

function deleteRecord(id) {
  const record = normalizeRecord(state.records.find((item) => item.id === id));
  if (!record) return;
  const detail = record.payMode === "direct" ? "直接薪水" : `${record.minutes} 分鐘`;
  const message = `確定要刪除 ${record.date} 的 ${detail}，$${money.format(calculatePay(record))} 這筆紀錄嗎？`;
  if (!confirm(message)) return;

  state.records = state.records.filter((item) => item.id !== id);
  if (!recordsForSelectedDay().length) state.selectedDay = "";
  saveState();
  render();
}

function addTag() {
  const tag = cleanTagName(els.tagNameInput.value);
  if (!tag) return showError("請輸入標籤名稱");
  if (state.tags.includes(tag)) return showError("這個標籤已經存在");
  state.tags.push(tag);
  state.tags.sort((a, b) => a.localeCompare(b, "zh-Hant"));
  state.managingTag = tag;
  saveState();
  render();
  els.manageTag.value = tag;
  els.tagNameInput.value = tag;
  updateTagButtons();
  showError("");
}

function renameTag() {
  const oldTag = state.managingTag || els.manageTag.value;
  const newTag = cleanTagName(els.tagNameInput.value);
  if (!oldTag) return showError("請先選擇要改名的標籤");
  if (!newTag) return showError("請輸入新的標籤名稱");
  if (oldTag !== newTag && state.tags.includes(newTag)) return showError("這個標籤已經存在");
  if (oldTag === newTag) return showError("");

  state.tags = state.tags.map((tag) => tag === oldTag ? newTag : tag).sort((a, b) => a.localeCompare(b, "zh-Hant"));
  state.records = state.records.map((record) => record.tag === oldTag ? { ...record, tag: newTag } : record);
  if (state.selectedTag === oldTag) state.selectedTag = newTag;
  state.managingTag = newTag;
  saveState();
  render();
  els.manageTag.value = newTag;
  els.tagNameInput.value = newTag;
  updateTagButtons();
  showError("");
}

function deleteTag() {
  const tag = state.managingTag || els.manageTag.value;
  if (!tag) return showError("請先選擇要刪除的標籤");
  if (!confirm(`確定要刪除「${tag}」標籤嗎？使用這個標籤的舊紀錄會改成無標籤。`)) return;

  state.tags = state.tags.filter((item) => item !== tag);
  state.records = state.records.map((record) => record.tag === tag ? { ...record, tag: "" } : record);
  if (state.selectedTag === tag) state.selectedTag = "";
  state.managingTag = "";
  els.tagNameInput.value = "";
  saveState();
  render();
  showError("");
}

function clearForm() {
  els.minutesInput.value = "";
  els.multiplier.value = "1";
  els.directPay.value = "";
  els.recordTag.value = "";
  els.note.value = "";
  els.workDate.value = todayString();
  els.startTime.value = "09:00";
  els.endTime.value = "10:00";
  els.nextDayEnd.checked = false;
  state.inputMode = "minutes";
  renderInputMode();
  renderEditMode();
}

function render() {
  els.hourlyRate.value = state.hourlyRate || els.hourlyRate.value;
  els.monthFilter.value = state.monthFilter;
  renderTagControls();
  renderInputMode();
  renderEditMode();
  renderSummaries();
  renderMonthSection();
  renderRecords();
}

function renderTagControls() {
  if (state.selectedTag && !state.tags.includes(state.selectedTag)) state.selectedTag = "";
  if (state.managingTag && !state.tags.includes(state.managingTag)) state.managingTag = "";
  renderRecordTagSelect();
  renderManageTagSelect();
  renderTagChips();
  updateTagButtons();
  els.tagHint.textContent = `${state.tags.length} 個標籤`;
  els.tagEmptyHint.textContent = state.tags.length ? "" : "還沒有標籤。可以先新增店名或工作地點，例如麥當勞、肯德基。";
}

function renderRecordTagSelect() {
  fillTagSelect(els.recordTag, "無標籤");
}

function renderManageTagSelect() {
  fillTagSelect(els.manageTag, "選擇標籤");
  els.manageTag.value = state.managingTag;
}

function renderTagChips() {
  els.tagChips.innerHTML = "";
  const all = createTagChip("", "全部標籤");
  els.tagChips.appendChild(all);
  state.tags.forEach((tag) => {
    els.tagChips.appendChild(createTagChip(tag, tag));
  });
}

function createTagChip(value, label) {
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = `tag-chip${state.selectedTag === value ? " is-selected" : ""}`;
  chip.textContent = label;
  chip.addEventListener("click", () => {
    state.selectedTag = value;
    saveState();
    renderMonthSection();
    renderRecords();
    renderTagChips();
  });
  return chip;
}

function updateTagButtons() {
  const hasTag = Boolean(state.managingTag || els.manageTag.value);
  els.renameTagButton.disabled = !hasTag;
  els.deleteTagButton.disabled = !hasTag;
}

function fillTagSelect(select, emptyLabel) {
  const current = select.value;
  select.innerHTML = "";
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = emptyLabel;
  select.appendChild(empty);
  state.tags.forEach((tag) => {
    const option = document.createElement("option");
    option.value = tag;
    option.textContent = tag;
    select.appendChild(option);
  });
  select.value = state.tags.includes(current) ? current : "";
}

function renderInputMode() {
  const minutes = state.inputMode === "minutes";
  const range = state.inputMode === "range";
  const direct = state.inputMode === "direct";
  els.minutesMode.classList.toggle("active", minutes);
  els.rangeMode.classList.toggle("active", range);
  els.directMode.classList.toggle("active", direct);
  els.minutesFields.hidden = !minutes;
  els.rangeFields.hidden = !range;
  els.timePayFields.hidden = direct;
  els.directPayFields.hidden = !direct;
}

function renderEditMode() {
  const editing = Boolean(state.editingId);
  els.formTitle.textContent = editing ? "編輯紀錄" : "新增紀錄";
  els.saveRecord.textContent = editing ? "儲存修改" : "新增紀錄";
  els.cancelEdit.textContent = editing ? "取消編輯" : "關閉";
}

function renderSummaries() {
  const today = todayString();
  const month = today.slice(0, 7);
  setSummary(els.todayPay, els.todayMinutes, summarize(state.records.filter((record) => record.date === today)));
  setSummary(els.monthPay, els.monthMinutes, summarize(state.records.filter((record) => record.date?.slice(0, 7) === month)));
  setSummary(els.totalPay, els.totalMinutes, summarize(state.records));
}

function renderMonthSection() {
  const records = recordsForSelectedMonth();
  const summary = summarize(records);
  els.filterMonthPay.textContent = `$${money.format(summary.pay)}`;
  els.filterMonthMinutes.textContent = `${summary.minutes} 分鐘`;
  els.clearDayFilter.hidden = !state.selectedDay;
  renderCalendar(records);
}

function renderCalendar(records) {
  els.calendarChart.innerHTML = "";
  const [year, month] = state.monthFilter.split("-").map(Number);
  if (!year || !month) return;

  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const startOffset = firstDay.getDay();
  const byDay = groupRecordsByDay(records);

  ["日", "一", "二", "三", "四", "五", "六"].forEach((label) => {
    const header = document.createElement("div");
    header.className = "calendar-weekday";
    header.textContent = label;
    els.calendarChart.appendChild(header);
  });

  for (let i = 0; i < startOffset; i++) {
    const blank = document.createElement("div");
    blank.className = "calendar-day is-empty";
    els.calendarChart.appendChild(blank);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${state.monthFilter}-${String(day).padStart(2, "0")}`;
    const dayRecords = byDay.get(date) || [];
    const summary = summarize(dayRecords);
    const button = document.createElement("button");
    button.type = "button";
    button.className = [
      "calendar-day",
      dayRecords.length ? "has-pay" : "",
      state.selectedDay === date ? "is-selected" : "",
    ].filter(Boolean).join(" ");
    button.innerHTML = `
      <span>${day}</span>
      <strong>${dayRecords.length ? "$" + compactMoney(summary.pay) : ""}</strong>
      <small>${dayRecords.length ? summary.minutes + "分" : ""}</small>
    `;
    button.addEventListener("click", () => {
      state.selectedDay = state.selectedDay === date ? "" : date;
      renderMonthSection();
      renderRecords();
    });
    els.calendarChart.appendChild(button);
  }
}

function setSummary(payEl, minutesEl, summary) {
  payEl.textContent = `$${money.format(summary.pay)}`;
  minutesEl.textContent = `${summary.minutes} 分鐘`;
}

function summarize(records) {
  return records.reduce((acc, rawRecord) => {
    const record = normalizeRecord(rawRecord);
    acc.minutes += record.payMode === "direct" ? 0 : Number(record.minutes) || 0;
    acc.pay += calculatePay(record);
    return acc;
  }, { minutes: 0, pay: 0 });
}

function renderRecords() {
  const records = state.selectedDay ? recordsForSelectedDay() : recordsForSelectedMonth();
  const tagText = state.selectedTag ? ` · ${state.selectedTag}` : "";
  els.filterHint.textContent = state.selectedDay
    ? `${formatDateLabel(state.selectedDay)}${tagText} 共 ${records.length} 筆`
    : `${state.monthFilter}${tagText} 共 ${records.length} 筆`;
  els.recordsList.innerHTML = "";

  if (!records.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = state.selectedDay || state.selectedTag
      ? "目前日期或標籤篩選下沒有紀錄。"
      : "這個月份還沒有紀錄。";
    els.recordsList.appendChild(empty);
    return;
  }

  const grouped = groupRecordsByDay(records);
  [...grouped.entries()].sort((a, b) => b[0].localeCompare(a[0])).forEach(([date, dayRecords]) => {
    const group = els.dayGroupTemplate.content.firstElementChild.cloneNode(true);
    const summary = summarize(dayRecords);
    group.querySelector(".day-title").textContent = formatDateLabel(date);
    group.querySelector(".day-total").textContent = `$${money.format(summary.pay)} · ${summary.minutes} 分 · ${dayRecords.length} 筆`;
    const container = group.querySelector(".day-records");

    dayRecords.forEach((record) => {
      container.appendChild(createRecordCard(normalizeRecord(record)));
    });

    els.recordsList.appendChild(group);
  });
}

function createRecordCard(record) {
  const node = els.recordTemplate.content.firstElementChild.cloneNode(true);
  const payModeDirect = record.payMode === "direct";
  const tagEl = node.querySelector(".record-tag");
  node.querySelector(".record-pay").textContent = `$${money.format(calculatePay(record))}`;
  node.querySelector(".record-meta").textContent = payModeDirect
    ? "直接薪水"
    : `${record.minutes} 分鐘 · ${record.timeRange || "直接輸入分鐘"} · 時薪 $${money.format(record.hourlyRate)} · ${money.format(record.multiplier)}x`;
  node.querySelector(".record-note").textContent = record.note || "沒有備註";
  if (record.tag) {
    tagEl.hidden = false;
    tagEl.textContent = record.tag;
  }
  node.querySelector(".edit-record").addEventListener("click", () => editRecord(record.id));
  node.querySelector(".delete-record").addEventListener("click", () => deleteRecord(record.id));
  return node;
}

function groupRecordsByDay(records) {
  const grouped = new Map();
  records.forEach((rawRecord) => {
    const record = normalizeRecord(rawRecord);
    if (!grouped.has(record.date)) grouped.set(record.date, []);
    grouped.get(record.date).push(record);
  });
  grouped.forEach((dayRecords) => {
    dayRecords.sort((a, b) => Number(b.id) - Number(a.id));
  });
  return grouped;
}

function recordsForSelectedMonth() {
  return state.records
    .map(normalizeRecord)
    .filter((record) => record.date && record.date.slice(0, 7) === state.monthFilter)
    .filter(matchesSelectedTag);
}

function recordsForSelectedDay() {
  return state.records
    .map(normalizeRecord)
    .filter((record) => record.date === state.selectedDay)
    .filter(matchesSelectedTag);
}

function matchesSelectedTag(record) {
  return !state.selectedTag || record.tag === state.selectedTag;
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    state.hourlyRate = saved.hourlyRate || "";
    state.records = Array.isArray(saved.records) ? saved.records.map(normalizeRecord) : [];
    state.tags = Array.isArray(saved.tags) ? saved.tags.map(cleanTagName).filter(Boolean) : tagsFromRecords(state.records);
    state.tags = [...new Set(state.tags)].sort((a, b) => a.localeCompare(b, "zh-Hant"));
    state.monthFilter = saved.monthFilter || "";
    state.selectedTag = saved.selectedTag || "";
    state.managingTag = state.tags.includes(saved.managingTag) ? saved.managingTag : "";
  } catch {
    state.hourlyRate = "";
    state.records = [];
    state.tags = [];
    state.monthFilter = "";
    state.selectedTag = "";
    state.managingTag = "";
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    hourlyRate: state.hourlyRate,
    records: state.records.map(normalizeRecord),
    tags: state.tags,
    monthFilter: state.monthFilter,
    selectedTag: state.selectedTag,
    managingTag: state.managingTag,
  }));
}

function normalizeRecord(record) {
  if (!record) return null;
  const payMode = record.payMode || (record.mode === "direct" || Number(record.directPay) > 0 ? "direct" : "time");
  return {
    id: record.id,
    date: record.date || todayString(),
    minutes: payMode === "direct" ? 0 : Number(record.minutes) || 0,
    timeRange: record.timeRange || "",
    nextDayEnd: Boolean(record.nextDayEnd),
    hourlyRate: Number(record.hourlyRate) || 0,
    multiplier: Number(record.multiplier) || 1,
    directPay: Number(record.directPay) || 0,
    tag: cleanTagName(record.tag || ""),
    note: record.note || "",
    mode: record.mode || (payMode === "direct" ? "direct" : (record.timeRange ? "range" : "minutes")),
    payMode,
  };
}

function calculatePay(rawRecord) {
  const record = normalizeRecord(rawRecord);
  if (record.payMode === "direct") return Number(record.directPay) || 0;
  return Number(record.hourlyRate) * Number(record.minutes) / 60 * Number(record.multiplier);
}

function compactMoney(value) {
  if (value >= 10000) return `${shortMoney.format(value / 10000)}萬`;
  if (value >= 1000) return `${Math.round(value).toLocaleString("zh-TW")}`;
  return money.format(value);
}

function cleanTagName(value) {
  return String(value || "").trim();
}

function tagsFromRecords(records) {
  return [...new Set(records.map((record) => cleanTagName(record.tag)).filter(Boolean))];
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function parseTime(value) {
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function todayString() {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function formatDateLabel(dateText) {
  const [, month, day] = dateText.split("-");
  return `${Number(month)}月${Number(day)}日`;
}

function showError(message) {
  els.formError.textContent = message;
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    let refreshing = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    navigator.serviceWorker.register("sw.js").then((registration) => {
      registration.update();
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) registration.update();
      });
    }).catch(() => {});
  }
}
