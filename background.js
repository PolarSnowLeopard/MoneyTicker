// 自动保存打卡记录的后台服务

// 获取今天日期字符串 YYYY-MM-DD
function getDateStr() {
  return new Date().toISOString().split('T')[0];
}

// 格式化时间 HH:MM
function formatTime(date) {
  return date.toTimeString().slice(0, 5);
}

// 解析时间字符串为今天的时间戳
function parseTimeToday(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
}

// 保存固定模式的打卡记录（带核验）
async function saveFixedRecord() {
  const data = await chrome.storage.local.get({
    mode: 'fixed',
    salary: 10000,
    startTime: '09:00',
    endTime: '18:00',
    workDays: 22,
    records: {}
  });
  
  const today = getDateStr();
  
  // 核验1: 确认是固定模式
  if (data.mode !== 'fixed') {
    console.log('[Money Ticker] 核验失败: 不是固定模式');
    return;
  }
  
  // 核验2: 确认当前时间确实已过下班时间
  const endTime = parseTimeToday(data.endTime);
  const now = new Date();
  if (now < endTime) {
    console.log('[Money Ticker] 核验失败: 还未到下班时间');
    return;
  }
  
  const startTime = parseTimeToday(data.startTime);
  const dailySalary = data.salary / data.workDays;
  const workHours = (endTime - startTime) / 1000 / 3600;
  
  data.records[today] = {
    mode: 'fixed',
    startTime: data.startTime,
    endTime: data.endTime,
    workHours: workHours.toFixed(2),
    earnings: dailySalary.toFixed(2)
  };
  
  await chrome.storage.local.set({ records: data.records });
  console.log('[Money Ticker] 固定模式 - 自动保存:', today);
}

// 保存弹性模式的打卡记录（带核验）
async function saveFlexRecord() {
  const data = await chrome.storage.local.get({
    mode: 'flex',
    dailySalary: 500,
    workHours: 8,
    flexStartTime: null,
    flexDate: null,
    records: {}
  });
  
  const today = getDateStr();
  const todayStr = new Date().toDateString();
  
  // 核验1: 确认是弹性模式
  if (data.mode !== 'flex') {
    console.log('[Money Ticker] 核验失败: 不是弹性模式');
    return;
  }
  
  // 核验2: 确认有开始计时且是今天的
  if (!data.flexStartTime || data.flexDate !== todayStr) {
    console.log('[Money Ticker] 核验失败: 没有今天的计时记录');
    return;
  }
  
  // 核验3: 确认工时确实已满
  const expectedEndTime = data.flexStartTime + data.workHours * 3600 * 1000;
  const now = Date.now();
  if (now < expectedEndTime) {
    console.log('[Money Ticker] 核验失败: 工时未满');
    return;
  }
  
  // 下班时间 = 上班时间 + 工时（不是当前时间）
  const startTime = new Date(data.flexStartTime);
  const endTime = new Date(expectedEndTime);
  
  data.records[today] = {
    mode: 'flex',
    startTime: formatTime(startTime),
    endTime: formatTime(endTime),
    workHours: data.workHours.toFixed(2),
    earnings: data.dailySalary.toFixed(2)
  };
  
  await chrome.storage.local.set({ 
    records: data.records,
    flexStartTime: null,
    flexDate: null
  });
  console.log('[Money Ticker] 弹性模式 - 自动保存:', today, '上班:', formatTime(startTime), '下班:', formatTime(endTime));
}

// 监听定时器触发
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'autoSave_fixed') {
    saveFixedRecord();
  } else if (alarm.name === 'autoSave_flex') {
    saveFlexRecord();
  }
});

// 监听存储变化，动态更新定时器
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  
  console.log('[Money Ticker] 存储变化:', Object.keys(changes));
  
  // 固定模式：下班时间或模式变化时重设定时器
  if (changes.endTime || changes.mode) {
    chrome.storage.local.get(['mode', 'endTime'], (data) => {
      // 先清除旧定时器
      chrome.alarms.clear('autoSave_fixed');
      
      if (data.mode === 'fixed' && data.endTime) {
        setFixedAlarm(data.endTime);
      }
    });
  }
  
  // 弹性模式：开始计时时设置定时器
  if (changes.flexStartTime) {
    console.log('[Money Ticker] flexStartTime 变化:', changes.flexStartTime);
    // 先清除旧定时器
    chrome.alarms.clear('autoSave_flex');
    
    const newValue = changes.flexStartTime.newValue;
    if (newValue) {
      chrome.storage.local.get(['workHours'], (data) => {
        setFlexAlarm(newValue, data.workHours || 8);
      });
    }
  }
  
  // 弹性模式：工时变化时重设定时器
  if (changes.workHours) {
    chrome.storage.local.get(['mode', 'flexStartTime', 'workHours'], (data) => {
      // 先清除旧定时器
      chrome.alarms.clear('autoSave_flex');
      
      if (data.mode === 'flex' && data.flexStartTime) {
        setFlexAlarm(data.flexStartTime, data.workHours);
      }
    });
  }
});

// 设置固定模式的定时器
function setFixedAlarm(endTimeStr) {
  const endTime = parseTimeToday(endTimeStr);
  const now = Date.now();
  
  if (endTime.getTime() > now) {
    chrome.alarms.create('autoSave_fixed', { when: endTime.getTime() });
    console.log('[Money Ticker] 设置固定模式定时器:', endTimeStr);
  } else {
    console.log('[Money Ticker] 固定模式: 今天下班时间已过，不设置定时器');
  }
}

// 设置弹性模式的定时器
// flexStartTime: 用户设置的上班时间戳（不是点击按钮的时间）
function setFlexAlarm(flexStartTime, workHours) {
  const endTime = flexStartTime + workHours * 3600 * 1000;
  const now = Date.now();
  
  if (endTime > now) {
    chrome.alarms.create('autoSave_flex', { when: endTime });
    const startStr = formatTime(new Date(flexStartTime));
    const endStr = formatTime(new Date(endTime));
    console.log('[Money Ticker] 设置弹性模式定时器: 上班', startStr, '→ 下班', endStr);
  } else {
    console.log('[Money Ticker] 弹性模式: 工时已满，不设置定时器（等待手动保存或popup触发）');
  }
}

// 初始化：检查当前状态并设置定时器
async function init() {
  const data = await chrome.storage.local.get({
    mode: 'fixed',
    endTime: '18:00',
    flexStartTime: null,
    flexDate: null,
    workHours: 8
  });
  
  const todayStr = new Date().toDateString();
  
  if (data.mode === 'fixed') {
    setFixedAlarm(data.endTime);
  } else if (data.mode === 'flex' && data.flexStartTime && data.flexDate === todayStr) {
    setFlexAlarm(data.flexStartTime, data.workHours);
  }
}

// 插件安装/更新时初始化
chrome.runtime.onInstalled.addListener(() => {
  console.log('[Money Ticker] 插件已安装/更新，初始化...');
  init();
});

// 浏览器启动时初始化
chrome.runtime.onStartup.addListener(() => {
  console.log('[Money Ticker] 浏览器启动，初始化...');
  init();
});

// Service Worker 激活时也初始化一次（确保定时器存在）
init();
console.log('[Money Ticker] Service Worker 已加载');
