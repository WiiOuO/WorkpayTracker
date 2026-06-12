const STORAGE_KEY = "workpay-tracker-state-v1";

const state = {
  hourlyRate: "",
  records: [],
  inputMode: "minutes",
  editingId: null,
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
  multiplier: $("multiplier"),
  note: $("note"),
  saveRecord: $("saveRecord"),
  formError: $("formError"),
  recordsList: $("recordsList"),
  recordTemplate: $("recordTemplate"),
  exportCsv: $("exportCsv"),
  formTitle: $("formTitle"),
  cancelEdit: $("cancelEdit"),
  installButton: $("installButton"),
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
  els.exportCsv.addEventListener("click", exportCsv);

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
  if (start == null || end == null) return { ok: false, error: "請輸入開始與結束時間" };
  if (end <= start) return { ok: false, error: "結束時間必須晚於開始時間；第一版不處理跨日班" };
  return {
    ok: true,
    minutes: end - start,
    timeRange: `${els.startTime.value} - ${els.endTime.value}`,
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
    els.endTime.value = end || "10:00";
  }

  renderInputMode();
  renderEditMode();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function deleteRecord(id) {
  state.records = state.records.filter((record) => record.id !== id);
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
  state.inputMode = "minutes";
  renderInputMode();
  renderEditMode();
}

function render() {
  els.hourlyRate.value = state.hourlyRate || els.hourlyRate.value;
  renderInputMode();
  renderEditMode();
  renderSummaries();
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
  const todaySummary = summarize((record) => record.date === today);
  const monthSummary = summarize((record) => record.date.slice(0, 7) === month);
  const totalSummary = summarize(() => true);

  setSummary(els.todayPay, els.todayMinutes, todaySummary);
  setSummary(els.monthPay, els.monthMinutes, monthSummary);
  setSummary(els.totalPay, els.totalMinutes, totalSummary);
}

function setSummary(payEl, minutesEl, summary) {
  payEl.textContent = `$${money.format(summary.pay)}`;
  minutesEl.textContent = `${summary.minutes} 分鐘`;
}

function summarize(filter) {
  return state.records.reduce((acc, record) => {
    if (!filter(record)) return acc;
    acc.minutes += Number(record.minutes) || 0;
    acc.pay += calculatePay(record);
    return acc;
  }, { minutes: 0, pay: 0 });
}

function renderRecords() {
  els.recordsList.innerHTML = "";
  if (!state.records.length) {
    els.recordsList.innerHTML = `<p class="record-meta">目前沒有紀錄。</p>`;
    return;
  }

  state.records.forEach((record) => {
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

function exportCsv() {
  const header = ["date", "minutes", "time_range", "hourly_rate", "multiplier", "pay", "note"];
  const rows = state.records.map((record) => [
    record.date,
    record.minutes,
    record.timeRange || "",
    money.format(record.hourlyRate),
    money.format(record.multiplier),
    money.format(calculatePay(record)),
    record.note || "",
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "workpay-records.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    state.hourlyRate = saved.hourlyRate || "";
    state.records = Array.isArray(saved.records) ? saved.records : [];
  } catch {
    state.hourlyRate = "";
    state.records = [];
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    hourlyRate: state.hourlyRate,
    records: state.records,
  }));
}

function calculatePay(record) {
  return Number(record.hourlyRate) * Number(record.minutes) / 60 * Number(record.multiplier);
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

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function showError(message) {
  els.formError.textContent = message;
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}
