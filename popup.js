const DEFAULT_CONFIG = {
  mode: 'fixed',
  salary: 10000,
  startTime: '09:00',
  endTime: '18:00',
  workDays: 22,
  dailySalary: 500,
  workHours: 8,
  flexStartTime: null,
  flexDate: null
};

let config = { ...DEFAULT_CONFIG };

function parseTime(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function getTodayStr() {
  return new Date().toDateString();
}

function formatTime(date) {
  return date.toTimeString().slice(0, 5);
}

// 固定时间模式
function calculateFixed() {
  const now = new Date();
  const startTime = parseTime(config.startTime);
  const endTime = parseTime(config.endTime);
  
  const dailyWorkSeconds = (endTime - startTime) / 1000;
  const dailySalary = config.salary / config.workDays;
  const perSecond = dailySalary / dailyWorkSeconds;
  
  const statusEl = document.getElementById('status');
  const moneyEl = document.getElementById('money');
  
  if (now < startTime) {
    statusEl.textContent = '☕ 还没开始上班';
    statusEl.className = 'status off';
    moneyEl.textContent = '¥0.00';
    return;
  }
  
  if (now > endTime) {
    statusEl.textContent = '🎉 今日已下班';
    statusEl.className = 'status off';
    moneyEl.textContent = '¥' + dailySalary.toFixed(2);
    return;
  }
  
  const workedSeconds = (now - startTime) / 1000;
  const earned = workedSeconds * perSecond;
  
  statusEl.textContent = '⚡ 努力搬砖中...';
  statusEl.className = 'status working';
  moneyEl.textContent = '¥' + earned.toFixed(2);
}

// 弹性工作模式
function calculateFlex() {
  const statusEl = document.getElementById('status');
  const moneyEl = document.getElementById('money');
  const clockInBtn = document.getElementById('clockIn');
  const clockOutBtn = document.getElementById('clockOut');
  
  // 检查是否是今天的打卡
  if (config.flexDate !== getTodayStr()) {
    config.flexStartTime = null;
    config.flexDate = null;
  }
  
  if (!config.flexStartTime) {
    statusEl.textContent = '👆 设置上班时间并开始计时';
    statusEl.className = 'status off';
    moneyEl.textContent = '¥0.00';
    clockInBtn.classList.remove('hidden');
    clockOutBtn.classList.add('hidden');
    return;
  }
  
  clockInBtn.classList.add('hidden');
  clockOutBtn.classList.remove('hidden');
  
  const now = Date.now();
  const totalWorkSeconds = config.workHours * 3600;
  const perSecond = config.dailySalary / totalWorkSeconds;
  const workedSeconds = (now - config.flexStartTime) / 1000;
  
  if (workedSeconds >= totalWorkSeconds) {
    statusEl.textContent = '🎉 今日工时已满！';
    statusEl.className = 'status off';
    moneyEl.textContent = '¥' + config.dailySalary.toFixed(2);
    return;
  }
  
  const earned = workedSeconds * perSecond;
  const remainHours = Math.floor((totalWorkSeconds - workedSeconds) / 3600);
  const remainMins = Math.floor(((totalWorkSeconds - workedSeconds) % 3600) / 60);
  
  statusEl.textContent = `⚡ 搬砖中... 还剩 ${remainHours}时${remainMins}分`;
  statusEl.className = 'status working';
  moneyEl.textContent = '¥' + earned.toFixed(2);
}

function calculate() {
  if (config.mode === 'flex') {
    calculateFlex();
  } else {
    calculateFixed();
  }
}

function toggleModeUI() {
  const isFixed = config.mode === 'fixed';
  document.getElementById('fixedSettings').classList.toggle('hidden', !isFixed);
  document.getElementById('flexSettings').classList.toggle('hidden', isFixed);
  document.getElementById('flexBtns').classList.toggle('hidden', isFixed);
}

function loadConfig() {
  chrome.storage.local.get(DEFAULT_CONFIG, (data) => {
    config = data;
    document.getElementById('mode').value = config.mode;
    document.getElementById('salary').value = config.salary;
    document.getElementById('startTime').value = config.startTime;
    document.getElementById('endTime').value = config.endTime;
    document.getElementById('dailySalary').value = config.dailySalary;
    document.getElementById('workHours').value = config.workHours;
    
    // 如果今天已经在计时，显示开始时间
    if (config.flexStartTime && config.flexDate === getTodayStr()) {
      document.getElementById('flexStartInput').value = formatTime(new Date(config.flexStartTime));
    }
    
    toggleModeUI();
    calculate();
  });
}

function saveConfig() {
  config.mode = document.getElementById('mode').value;
  config.salary = Number(document.getElementById('salary').value) || DEFAULT_CONFIG.salary;
  config.startTime = document.getElementById('startTime').value || DEFAULT_CONFIG.startTime;
  config.endTime = document.getElementById('endTime').value || DEFAULT_CONFIG.endTime;
  config.dailySalary = Number(document.getElementById('dailySalary').value) || DEFAULT_CONFIG.dailySalary;
  config.workHours = Number(document.getElementById('workHours').value) || DEFAULT_CONFIG.workHours;
  
  chrome.storage.local.set(config, () => {
    toggleModeUI();
    calculate();
  });
}

// 弹性模式 - 根据输入的时间开始计时
function clockIn() {
  const timeInput = document.getElementById('flexStartInput').value;
  const startTime = parseTime(timeInput);
  
  // 如果设置的时间在未来，使用当前时间
  const now = new Date();
  if (startTime > now) {
    config.flexStartTime = now.getTime();
  } else {
    config.flexStartTime = startTime.getTime();
  }
  
  config.flexDate = getTodayStr();
  chrome.storage.local.set(config, calculate);
}

function clockOut() {
  // 保存今日打卡记录
  saveRecord();
  config.flexStartTime = null;
  config.flexDate = null;
  chrome.storage.local.set(config, calculate);
}

// 获取日期字符串 YYYY-MM-DD
function getDateStr(date = new Date()) {
  return date.toISOString().split('T')[0];
}

// 保存打卡记录
function saveRecord() {
  if (!config.flexStartTime) return;
  
  const dateStr = getDateStr();
  const startTime = new Date(config.flexStartTime);
  const endTime = new Date();
  const workHours = Math.min((endTime - startTime) / 1000 / 3600, config.workHours);
  const earnings = (workHours / config.workHours) * config.dailySalary;
  
  chrome.storage.local.get({ records: {} }, (data) => {
    data.records[dateStr] = {
      mode: 'flex',
      startTime: formatTime(startTime),
      endTime: formatTime(endTime),
      workHours: workHours.toFixed(2),
      earnings: earnings.toFixed(2)
    };
    chrome.storage.local.set({ records: data.records });
  });
}

// 打开历史记录页面
function openHistory() {
  chrome.tabs.create({ url: 'history.html' });
}

document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  setInterval(calculate, 1000);
  
  document.getElementById('save').addEventListener('click', saveConfig);
  document.getElementById('mode').addEventListener('change', () => {
    config.mode = document.getElementById('mode').value;
    toggleModeUI();
    calculate();
  });
  document.getElementById('clockIn').addEventListener('click', clockIn);
  document.getElementById('clockOut').addEventListener('click', clockOut);
  document.getElementById('openHistory').addEventListener('click', openHistory);
});
