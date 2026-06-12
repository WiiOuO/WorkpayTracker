const STORAGE_KEY = "workpay-tracker-state-v1";

const state = {
  hourlyRate: "",
  records: [],
  inputMode: "minutes",
  editingId: null,
  monthFilter: "",
};

const $ = (id) => document.getElementById(id);
const money = new Intl.NumberFormat("zh-TW", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
  minutesFields: $("minutesFields"),
  rangeFields: $("rangeFields"),
  minutesInput: $("minutesInput"),
  startTime: $("startTime"),
  endTime: $("endTime"),
  nextDayEnd: $("nextDayEnd"),
  multiplier: $("multiplier"),
  note: $("note"),
  saveRecord: $("saveRecord"),
  formError: $("formError"),
  recordsList: $("recordsList"),
  recordTemplate: $("recordTemplate"),
  formTitle: $("formTitle"),
  cancelEdit: $("cancelEdit"),
  installButton: $("installButton"),
  monthFilter: $("monthFilter"),
  filterMonthPay: $("filterMonthPay"),
  filterMonthMinutes: $("filterMonthMinutes"),
  filterHint: $("filterHint"),
  calendarChart: $("calendarChart"),
  chart: $("chart"),
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
  els.saveRate.addEventListener("click", () => {
    const rate = positiveNumber(els.hourlyRate.value);
    if (!rate) return showError("請輸入大於 0 的基礎時薪");
    state.hourlyRate = String(rate);
    saveState();
    render();
    showError("");
  });

  els.minutesMode.addEventListener("click", () => setInputMode("minutes"));
  els.rangeMode.addEventListener("click", () => setInputMode("range"));
  els.saveRecord.addEventListener("click", saveRecord);
  els.cancelEdit.addEventListener("click", cancelEdit);
  els.monthFilter.addEventListener("change", () => {
    state.monthFilter = els.monthFilter.value || todayString().slice(0, 7);
    saveState();
    renderMonthSection();
    renderRecords();
  });

  els.hourlyRate.addEventListener("change", () => {
    const rate = positiveNumber(els.hourlyRate.value);
    if (rate) {
      state.hourlyRate = String(rate);
      saveState();
      renderSummaries();
    }
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

function setInputMode(mode) {
  state.inputMode = mode;
  renderInputMode();
}

function saveRecord() {
  showError("");
  const hourlyRate = positiveNumber(els.hourlyRate.value);
  if (!hourlyRate) return showError("請先輸入大於 0 的基礎時薪");

  const multiplier = positiveNumber(els.multiplier.value);
  if (!multiplier) return showError("倍率必須大於 0");

  const date = els.workDate.value;
  if (!date) return showError("請選擇日期");

  const duration = readDuration();
  if (!duration.ok) return showError(duration.error);

  const payload = {
    id: state.editingId ?? Date.now(),
    date,
    minutes: duration.minutes,
    timeRange: duration.timeRange,
    nextDayEnd: duration.nextDayEnd,
    hourlyRate,
    multiplier,
    note: els.note.value.trim(),
    mode: state.inputMode,
  };

  state.hourlyRate = String(hourlyRate);

  if (state.editingId) {
    state.records = state.records.map((record) => record.id === state.editingId ? payload : record);
  } else {
    state.records.unshift(payload);
  }

  state.editingId = null;
  saveState();
  clearForm();
  render();
}

function readDuration() {
  if (state.inputMode === "minutes") {
    const minutes = positiveInteger(els.minutesInput.value);
    if (!minutes) return { ok: false, error: "請輸入大於 0 的工作分鐘" };
    return { ok: true, minutes, timeRange: "" };
  }

  const start = parseTime(els.startTime.value);
  const end = parseTime(els.endTime.value);
  const nextDayEnd = els.nextDayEnd.checked;
  if (start == null || end == null) return { ok: false, error: "請輸入開始與結束時間" };
  const adjustedEnd = nextDayEnd ? end + 24 * 60 : end;
  if (adjustedEnd <= start) return { ok: false, error: "結束時間必須晚於開始時間；如果是跨日班，請勾選隔日" };
  return {
    ok: true,
    minutes: adjustedEnd - start,
    timeRange: `${els.startTime.value} - ${nextDayEnd ? "隔日 " : ""}${els.endTime.value}`,
    nextDayEnd,
  };
}

function editRecord(id) {
  const record = state.records.find((item) => item.id === id);
  if (!record) return;

  state.editingId = id;
  state.inputMode = record.mode || (record.timeRange ? "range" : "minutes");
  els.workDate.value = record.date;
  els.hourlyRate.value = record.hourlyRate;
  els.multiplier.value = record.multiplier;
  els.note.value = record.note || "";

  if (state.inputMode === "minutes") {
    els.minutesInput.value = record.minutes;
  } else {
    const [start, end] = (record.timeRange || "09:00 - 10:00").split(" - ");
    els.startTime.value = start || "09:00";
    els.nextDayEnd.checked = Boolean(record.nextDayEnd) || (end || "").startsWith("隔日 ");
    els.endTime.value = (end || "10:00").replace("隔日 ", "");
  }

  renderInputMode();
  renderEditMode();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function deleteRecord(id) {
  const record = state.records.find((item) => item.id === id);
  if (!record) return;
  const message = `確定要刪除 ${record.date}、${record.minutes} 分鐘、$${money.format(calculatePay(record))} 的紀錄嗎？`;
  if (!confirm(message)) return;

  state.records = state.records.filter((item) => item.id !== id);
  if (state.editingId === id) clearForm();
  saveState();
  render();
}

function cancelEdit() {
  state.editingId = null;
  clearForm();
  renderEditMode();
}

function clearForm() {
  els.minutesInput.value = "";
  els.multiplier.value = "1";
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
  renderInputMode();
  renderEditMode();
  renderSummaries();
  renderMonthSection();
  renderRecords();
}

function renderInputMode() {
  const minutes = state.inputMode === "minutes";
  els.minutesMode.classList.toggle("active", minutes);
  els.rangeMode.classList.toggle("active", !minutes);
  els.minutesFields.hidden = !minutes;
  els.rangeFields.hidden = minutes;
}

function renderEditMode() {
  const editing = Boolean(state.editingId);
  els.formTitle.textContent = editing ? "編輯紀錄" : "新增紀錄";
  els.saveRecord.textContent = editing ? "儲存修改" : "新增紀錄";
  els.cancelEdit.hidden = !editing;
}

function renderSummaries() {
  const today = todayString();
  const month = today.slice(0, 7);
  setSummary(els.todayPay, els.todayMinutes, summarize(state.records.filter((record) => record.date === today)));
  setSummary(els.monthPay, els.monthMinutes, summarize(state.records.filter((record) => record.date.slice(0, 7) === month)));
  setSummary(els.totalPay, els.totalMinutes, summarize(state.records));
}

function renderMonthSection() {
  const records = recordsForSelectedMonth();
  const summary = summarize(records);
  els.filterMonthPay.textContent = `$${money.format(summary.pay)}`;
  els.filterMonthMinutes.textContent = `${summary.minutes} 分鐘`;
  renderCalendar(records);
  renderChart(records);
}

function renderCalendar(records) {
  els.calendarChart.innerHTML = "";
  const [year, month] = state.monthFilter.split("-").map(Number);
  if (!year || !month) return;

  const firstDay = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const startOffset = firstDay.getDay();
  const byDay = new Map();

  records.forEach((record) => {
    const day = Number(record.date.slice(8, 10));
    const current = byDay.get(day) || { pay: 0, minutes: 0 };
    current.pay += calculatePay(record);
    current.minutes += Number(record.minutes) || 0;
    byDay.set(day, current);
  });

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
    const data = byDay.get(day);
    const cell = document.createElement("div");
    cell.className = `calendar-day${data ? " has-pay" : ""}`;
    cell.innerHTML = `
      <span>${day}</span>
      <strong>${data ? "$" + compactMoney(data.pay) : ""}</strong>
      <small>${data ? data.minutes + "分" : ""}</small>
    `;
    els.calendarChart.appendChild(cell);
  }
}

function renderChart(records) {
  els.chart.innerHTML = "";
  const byDay = new Map();
  records.forEach((record) => {
    const day = Number(record.date.slice(8, 10));
    byDay.set(day, (byDay.get(day) || 0) + calculatePay(record));
  });

  if (!records.length) {
    els.chart.innerHTML = `<p class="chart-empty">這個月份還沒有紀錄。</p>`;
    return;
  }

  const maxPay = Math.max(...byDay.values(), 1);
  [...byDay.entries()].sort((a, b) => a[0] - b[0]).forEach(([day, pay]) => {
    const row = document.createElement("div");
    row.className = "chart-row";
    row.innerHTML = `
      <span>${day}日</span>
      <div class="chart-track"><div class="chart-bar" style="width:${Math.max(6, pay / maxPay * 100)}%"></div></div>
      <strong>$${money.format(pay)}</strong>
    `;
    els.chart.appendChild(row);
  });
}

function setSummary(payEl, minutesEl, summary) {
  payEl.textContent = `$${money.format(summary.pay)}`;
  minutesEl.textContent = `${summary.minutes} 分鐘`;
}

function summarize(records) {
  return records.reduce((acc, record) => {
    acc.minutes += Number(record.minutes) || 0;
    acc.pay += calculatePay(record);
    return acc;
  }, { minutes: 0, pay: 0 });
}

function renderRecords() {
  const records = recordsForSelectedMonth();
  els.filterHint.textContent = `${state.monthFilter} 共 ${records.length} 筆`;
  els.recordsList.innerHTML = "";
  if (!records.length) {
    els.recordsList.innerHTML = `<p class="record-meta">這個月份沒有紀錄。</p>`;
    return;
  }

  records.forEach((record) => {
    const node = els.recordTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".record-pay").textContent = `$${money.format(calculatePay(record))}`;
    node.querySelector(".record-meta").textContent =
      `${record.date} · ${record.minutes} 分鐘 · ${record.timeRange || "直接輸入分鐘"} · 時薪 $${money.format(record.hourlyRate)} · ${money.format(record.multiplier)}x`;
    node.querySelector(".record-note").textContent = record.note || "沒有備註";
    node.querySelector(".edit-record").addEventListener("click", () => editRecord(record.id));
    node.querySelector(".delete-record").addEventListener("click", () => deleteRecord(record.id));
    els.recordsList.appendChild(node);
  });
}

function recordsForSelectedMonth() {
  return state.records.filter((record) => record.date.slice(0, 7) === state.monthFilter);
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    state.hourlyRate = saved.hourlyRate || "";
    state.records = Array.isArray(saved.records) ? saved.records : [];
    state.monthFilter = saved.monthFilter || "";
  } catch {
    state.hourlyRate = "";
    state.records = [];
    state.monthFilter = "";
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    hourlyRate: state.hourlyRate,
    records: state.records,
    monthFilter: state.monthFilter,
  }));
}

function calculatePay(record) {
  return Number(record.hourlyRate) * Number(record.minutes) / 60 * Number(record.multiplier);
}

function compactMoney(value) {
  if (value >= 10000) return `${money.format(value / 10000)}萬`;
  if (value >= 1000) return `${Math.round(value).toLocaleString("zh-TW")}`;
  return money.format(value);
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
