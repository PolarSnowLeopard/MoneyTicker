// 数据存储
let records = {};
let dailyReports = {};
let weeklyReports = {};
let config = { dailySalary: 500, workHours: 8 };

// Toast 提示
function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2000);
}

// 加载数据
function loadData() {
  chrome.storage.local.get(
    {
      records: {},
      dailyReports: {},
      weeklyReports: {},
      dailySalary: 500,
      workHours: 8,
    },
    (data) => {
      records = data.records;
      dailyReports = data.dailyReports;
      weeklyReports = data.weeklyReports;
      config.dailySalary = data.dailySalary;
      config.workHours = data.workHours;
      renderRecords();
      renderDailyList();
      renderWeeklyList();
      updateStats();
    }
  );
}

// ==================== 打卡记录 ====================

function renderRecords() {
  const tbody = document.getElementById("recordsBody");
  const empty = document.getElementById("emptyRecords");
  const dates = Object.keys(records).sort().reverse();

  if (dates.length === 0) {
    tbody.innerHTML = "";
    empty.style.display = "block";
    return;
  }

  empty.style.display = "none";
  tbody.innerHTML = dates
    .map((date) => {
      const r = records[date];
      const hasReport = dailyReports[date] && dailyReports[date].trim();
      return `
      <tr data-date="${date}">
        <td>${date}</td>
        <td><input type="time" value="${r.startTime}" class="edit-start"></td>
        <td><input type="time" value="${r.endTime}" class="edit-end"></td>
        <td>${r.workHours}h</td>
        <td>¥${r.earnings}</td>
        <td>
          <span class="report-badge ${
            hasReport ? "done" : "pending"
          }" data-date="${date}">
            ${hasReport ? "✅ 已写" : "⏳ 未写"}
          </span>
        </td>
        <td>
          <button class="btn-secondary btn-sm btn-save">保存</button>
          <button class="btn-danger btn-sm btn-delete">删除</button>
        </td>
      </tr>
    `;
    })
    .join("");

  bindRecordEvents();
}

function bindRecordEvents() {
  const tbody = document.getElementById("recordsBody");

  // 保存按钮
  tbody.querySelectorAll(".btn-save").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const row = e.target.closest("tr");
      const date = row.dataset.date;
      const start = row.querySelector(".edit-start").value;
      const end = row.querySelector(".edit-end").value;
      updateRecord(date, start, end);
    });
  });

  // 删除按钮
  tbody.querySelectorAll(".btn-delete").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const date = e.target.closest("tr").dataset.date;
      if (confirm(`确定删除 ${date} 的记录吗？`)) {
        deleteRecord(date);
      }
    });
  });

  // 日报徽章点击
  tbody.querySelectorAll(".report-badge").forEach((badge) => {
    badge.addEventListener("click", (e) => {
      const date = e.target.dataset.date;
      // 切换到日报 Tab 并选中该日期
      document.querySelector('[data-tab="daily"]').click();
      document.getElementById("dailyDate").value = date;
      document.getElementById("dailyEditor").value = dailyReports[date] || "";
      highlightDailyItem(date);
    });
  });
}

// 新增记录
function initAddRecord() {
  const form = document.getElementById("addRecordForm");
  const dateInput = document.getElementById("newDate");
  dateInput.value = new Date().toISOString().split("T")[0];

  document.getElementById("toggleAddForm").addEventListener("click", () => {
    form.classList.toggle("show");
  });

  document.getElementById("cancelAdd").addEventListener("click", () => {
    form.classList.remove("show");
  });

  document.getElementById("addRecord").addEventListener("click", () => {
    const date = dateInput.value;
    const start = document.getElementById("newStart").value;
    const end = document.getElementById("newEnd").value;

    if (!date) {
      showToast("❌ 请选择日期");
      return;
    }

    if (records[date]) {
      if (!confirm(`${date} 已有记录，是否覆盖？`)) return;
    }

    addRecord(date, start, end);
    form.classList.remove("show");
  });
}

function addRecord(date, startTime, endTime) {
  const workHours = calculateWorkHours(startTime, endTime);
  const earnings = (
    (workHours / config.workHours) *
    config.dailySalary
  ).toFixed(2);

  records[date] = {
    mode: "manual",
    startTime,
    endTime,
    workHours: workHours.toFixed(2),
    earnings,
  };

  chrome.storage.local.set({ records }, () => {
    showToast("✅ 记录已添加");
    renderRecords();
    updateStats();
  });
}

function updateRecord(date, startTime, endTime) {
  const workHours = calculateWorkHours(startTime, endTime);
  const earnings = (
    (workHours / config.workHours) *
    config.dailySalary
  ).toFixed(2);

  records[date] = {
    ...records[date],
    startTime,
    endTime,
    workHours: workHours.toFixed(2),
    earnings,
  };
  chrome.storage.local.set({ records }, () => {
    showToast("✅ 记录已更新");
    renderRecords();
    updateStats();
  });
}

function deleteRecord(date) {
  delete records[date];
  chrome.storage.local.set({ records }, () => {
    showToast("🗑️ 记录已删除");
    renderRecords();
    updateStats();
  });
}

function calculateWorkHours(startTime, endTime) {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  return Math.max(0, (end - start) / 60);
}

function parseTimeToMinutes(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

// ==================== 日报 ====================

function renderDailyList() {
  const list = document.getElementById("dailyList");
  const dates = Object.keys(dailyReports)
    .filter((d) => dailyReports[d].trim())
    .sort()
    .reverse();

  document.getElementById("dailyCount").textContent = `共 ${dates.length} 篇`;

  if (dates.length === 0) {
    list.innerHTML =
      '<div class="empty-state">暂无日报，点击下方「新建日报」开始</div>';
    return;
  }

  list.innerHTML = dates
    .map((date) => {
      const preview = dailyReports[date]
        .split("\n")[0]
        .replace(/^#+ /, "")
        .slice(0, 30);
      return `
      <div class="report-item" data-date="${date}">
        <div class="report-item-date">📝 ${date}</div>
        <div class="report-item-preview">${preview || "无标题"}</div>
      </div>
    `;
    })
    .join("");

  // 绑定点击事件
  list.querySelectorAll(".report-item").forEach((item) => {
    item.addEventListener("click", () => {
      const date = item.dataset.date;
      document.getElementById("dailyDate").value = date;
      document.getElementById("dailyEditor").value = dailyReports[date] || "";
      highlightDailyItem(date);
    });
  });
}

function highlightDailyItem(date) {
  document.querySelectorAll("#dailyList .report-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.date === date);
  });
}

function initDailyReport() {
  const dateInput = document.getElementById("dailyDate");
  const editor = document.getElementById("dailyEditor");

  dateInput.value = new Date().toISOString().split("T")[0];

  dateInput.addEventListener("change", () => {
    editor.value = dailyReports[dateInput.value] || "";
    highlightDailyItem(dateInput.value);
  });

  setTimeout(() => {
    editor.value = dailyReports[dateInput.value] || "";
  }, 100);

  // 新建日报
  document.getElementById("newDailyReport").addEventListener("click", () => {
    dateInput.value = new Date().toISOString().split("T")[0];
    editor.value = "";
    highlightDailyItem("");
  });

  // 保存日报
  document.getElementById("saveDailyReport").addEventListener("click", () => {
    const date = dateInput.value;
    if (!date) {
      showToast("❌ 请选择日期");
      return;
    }
    dailyReports[date] = editor.value;
    chrome.storage.local.set({ dailyReports }, () => {
      showToast("✅ 日报已保存");
      renderDailyList();
      renderRecords(); // 更新打卡记录中的日报状态
      highlightDailyItem(date);
    });
  });

  // 导出日报
  document.getElementById("exportDailyReport").addEventListener("click", () => {
    const date = dateInput.value;
    const content = editor.value || "暂无内容";
    downloadFile(`日报_${date}.md`, content);
  });

  // 删除日报
  document.getElementById("deleteDailyReport").addEventListener("click", () => {
    const date = dateInput.value;
    if (!dailyReports[date]) {
      showToast("❌ 该日期暂无日报");
      return;
    }
    if (confirm(`确定删除 ${date} 的日报吗？`)) {
      delete dailyReports[date];
      chrome.storage.local.set({ dailyReports }, () => {
        showToast("🗑️ 日报已删除");
        editor.value = "";
        renderDailyList();
        renderRecords();
      });
    }
  });
}

// ==================== 周报 ====================

function renderWeeklyList() {
  const list = document.getElementById("weeklyList");
  const weeks = Object.keys(weeklyReports)
    .filter((w) => weeklyReports[w].trim())
    .sort()
    .reverse();

  document.getElementById("weeklyCount").textContent = `共 ${weeks.length} 篇`;

  if (weeks.length === 0) {
    list.innerHTML =
      '<div class="empty-state">暂无周报，点击下方「新建周报」开始</div>';
    return;
  }

  list.innerHTML = weeks
    .map((week) => {
      const preview = weeklyReports[week]
        .split("\n")[0]
        .replace(/^#+ /, "")
        .slice(0, 30);
      return `
      <div class="report-item" data-week="${week}">
        <div class="report-item-date">📋 ${week}</div>
        <div class="report-item-preview">${preview || "无标题"}</div>
      </div>
    `;
    })
    .join("");

  list.querySelectorAll(".report-item").forEach((item) => {
    item.addEventListener("click", () => {
      const week = item.dataset.week;
      document.getElementById("weeklyDate").value = week;
      document.getElementById("weeklyEditor").value = weeklyReports[week] || "";
      highlightWeeklyItem(week);
    });
  });
}

function highlightWeeklyItem(week) {
  document.querySelectorAll("#weeklyList .report-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.week === week);
  });
}

function initWeeklyReport() {
  const weekInput = document.getElementById("weeklyDate");
  const editor = document.getElementById("weeklyEditor");

  const now = new Date();
  const year = now.getFullYear();
  const week = getWeekNumber(now);
  weekInput.value = `${year}-W${week.toString().padStart(2, "0")}`;

  weekInput.addEventListener("change", () => {
    editor.value = weeklyReports[weekInput.value] || "";
    highlightWeeklyItem(weekInput.value);
  });

  setTimeout(() => {
    editor.value = weeklyReports[weekInput.value] || "";
  }, 100);

  // 新建周报
  document.getElementById("newWeeklyReport").addEventListener("click", () => {
    const now = new Date();
    const year = now.getFullYear();
    const week = getWeekNumber(now);
    weekInput.value = `${year}-W${week.toString().padStart(2, "0")}`;
    editor.value = "";
    highlightWeeklyItem("");
  });

  // 保存周报
  document.getElementById("saveWeeklyReport").addEventListener("click", () => {
    const week = weekInput.value;
    if (!week) {
      showToast("❌ 请选择周");
      return;
    }
    weeklyReports[week] = editor.value;
    chrome.storage.local.set({ weeklyReports }, () => {
      showToast("✅ 周报已保存");
      renderWeeklyList();
      highlightWeeklyItem(week);
    });
  });

  // 导出周报
  document
    .getElementById("exportWeeklyReport")
    .addEventListener("click", () => {
      const week = weekInput.value;
      const content = editor.value || "暂无内容";
      downloadFile(`周报_${week}.md`, content);
    });

  // 删除周报
  document
    .getElementById("deleteWeeklyReport")
    .addEventListener("click", () => {
      const week = weekInput.value;
      if (!weeklyReports[week]) {
        showToast("❌ 该周暂无周报");
        return;
      }
      if (confirm(`确定删除 ${week} 的周报吗？`)) {
        delete weeklyReports[week];
        chrome.storage.local.set({ weeklyReports }, () => {
          showToast("🗑️ 周报已删除");
          editor.value = "";
          renderWeeklyList();
        });
      }
    });
}

function getWeekNumber(date) {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

// ==================== Tab 切换 ====================

function initTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document
        .querySelectorAll(".tab")
        .forEach((t) => t.classList.remove("active"));
      document
        .querySelectorAll(".panel")
        .forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(tab.dataset.tab).classList.add("active");
    });
  });
}

// ==================== 备份 ====================

function initBackup() {
  document.getElementById("exportAll").addEventListener("click", () => {
    const data = {
      records,
      dailyReports,
      weeklyReports,
      exportTime: new Date().toISOString(),
    };
    const json = JSON.stringify(data, null, 2);
    downloadFile(
      `MoneyTicker_backup_${new Date().toISOString().split("T")[0]}.json`,
      json
    );
    showToast("✅ 数据已导出");
  });

  document.getElementById("importBtn").addEventListener("click", () => {
    document.getElementById("importFile").click();
  });

  document.getElementById("importFile").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result);
        if (data.records) records = { ...records, ...data.records };
        if (data.dailyReports)
          dailyReports = { ...dailyReports, ...data.dailyReports };
        if (data.weeklyReports)
          weeklyReports = { ...weeklyReports, ...data.weeklyReports };

        chrome.storage.local.set(
          { records, dailyReports, weeklyReports },
          () => {
            showToast("✅ 数据已导入");
            renderRecords();
            renderDailyList();
            renderWeeklyList();
            updateStats();
          }
        );
      } catch (err) {
        showToast("❌ 导入失败，文件格式错误");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  });

  document.getElementById("clearAll").addEventListener("click", () => {
    if (confirm("确定要清空所有数据吗？此操作不可恢复！\n\n建议先导出备份。")) {
      records = {};
      dailyReports = {};
      weeklyReports = {};
      chrome.storage.local.set({ records, dailyReports, weeklyReports }, () => {
        showToast("🗑️ 所有数据已清空");
        renderRecords();
        renderDailyList();
        renderWeeklyList();
        updateStats();
      });
    }
  });
}

// ==================== 统计 ====================

function updateStats() {
  const dates = Object.keys(records);
  const totalDays = dates.length;
  const totalHours = dates.reduce(
    (sum, d) => sum + parseFloat(records[d].workHours || 0),
    0
  );
  const totalEarnings = dates.reduce(
    (sum, d) => sum + parseFloat(records[d].earnings || 0),
    0
  );
  const dailyCount = Object.keys(dailyReports).filter((d) =>
    dailyReports[d].trim()
  ).length;
  const weeklyCount = Object.keys(weeklyReports).filter((w) =>
    weeklyReports[w].trim()
  ).length;

  // 计算有打卡但没写日报的天数
  const missingReports = dates.filter(
    (d) => !dailyReports[d] || !dailyReports[d].trim()
  ).length;

  document.getElementById("stats").innerHTML = `
    <p>📅 打卡天数：<strong>${totalDays}</strong> 天</p>
    <p>⏱️ 总工时：<strong>${totalHours.toFixed(1)}</strong> 小时</p>
    <p>💰 总收入：<strong>¥${totalEarnings.toFixed(2)}</strong></p>
    <p>📝 日报数量：<strong>${dailyCount}</strong> 篇 ${
    missingReports > 0
      ? `<span style="color:#d97706;">（${missingReports}天未写）</span>`
      : ""
  }</p>
    <p>📋 周报数量：<strong>${weeklyCount}</strong> 篇</p>
  `;
}

// ==================== 工具函数 ====================

function downloadFile(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ==================== 初始化 ====================

document.addEventListener("DOMContentLoaded", () => {
  loadData();
  initTabs();
  initAddRecord();
  initDailyReport();
  initWeeklyReport();
  initBackup();
});
