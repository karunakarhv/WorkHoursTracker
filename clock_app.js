const WORK_DAY_SECONDS = 8 * 60 * 60;

let state = {
    isClockedIn: false,
    isOnBreak: false,
    clockInTime: null,
    clockOutTime: null,
    breakStartTime: null,
    totalBreakSeconds: 0,
    logs: [],
    logFilter: { from: null, to: null }
};

// BACKEND ENDPOINTS
const BACKEND_LOGS_ENDPOINT = '/api/logs';
const BACKEND_LOGS_CLEAR_ENDPOINT = '/api/logs/clear';
const BACKEND_LOGS_IMPORT_ENDPOINT = '/api/logs/import';
const BACKEND_LOGS_EXPORT_ENDPOINT = '/api/logs/export';

async function fetchLogsFromBackend() {
    try {
        const res = await fetch(BACKEND_LOGS_ENDPOINT, { method: 'GET' });
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) {
                state.logs = data;
                saveState();
                refreshLogs();
                setStatus('Logs loaded from backend.', 'info');
            }
        }
    } catch (e) {
        setStatus('Failed to load logs from backend.', 'danger');
    }
}

async function saveLogToBackend(log) {
    try {
        await fetch(BACKEND_LOGS_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(log)
        });
    } catch (e) {
        // fallback: do nothing, local state still updated
    }
}

async function clearLogsFromBackend() {
    try {
        await fetch(BACKEND_LOGS_CLEAR_ENDPOINT, { method: 'POST' });
    } catch (e) {
        // fallback
    }
}

function saveDataFile(data, filename = 'clocklogs.json') {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 50);
}

async function saveLogsToBackendFile() {
    let params = [];
    try {
        if (state.logFilter) {
            if (state.logFilter.from) {
                const fromDate = new Date(state.logFilter.from);
                const fromStr = `${fromDate.getFullYear()}-${leading(fromDate.getMonth() + 1)}-${leading(
                    fromDate.getDate()
                )} ${leading(fromDate.getHours())}:${leading(fromDate.getMinutes())}:${leading(fromDate.getSeconds())}`;
                params.push('from=' + encodeURIComponent(fromStr));
            }
            if (state.logFilter.to) {
                const toDate = new Date(state.logFilter.to);
                const toStr = `${toDate.getFullYear()}-${leading(toDate.getMonth() + 1)}-${leading(
                    toDate.getDate()
                )} ${leading(toDate.getHours())}:${leading(toDate.getMinutes())}:${leading(toDate.getSeconds())}`;
                params.push('to=' + encodeURIComponent(toStr));
            }
        }
        let endpoint = BACKEND_LOGS_EXPORT_ENDPOINT;
        if (params.length > 0) {
            endpoint += '?' + params.join('&');
        }
        const res = await fetch(endpoint, { method: 'GET' });
        if (res.ok) {
            const csv = await res.text();
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'clocklogs.csv';
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 50);
            setStatus('Logs exported from backend.', 'info');
        } else {
            setStatus('Failed to export logs from backend.', 'danger');
        }
    } catch (e) {
        setStatus('Failed to export logs from backend.', 'danger');
    }
}

function loadDataFile(callback) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = () => {
        if (input.files.length > 0) {
            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const json = JSON.parse(evt.target.result);
                    callback(json);
                } catch (e) {
                    alert('Failed to load file: Invalid format');
                }
            };
            reader.readAsText(input.files[0]);
        }
    };
    input.click();
}

function loadLogsFromLocalFile() {
    loadDataFile(async (json) => {
        if (Array.isArray(json)) {
            try {
                await fetch(BACKEND_LOGS_IMPORT_ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(json)
                });
                await fetchLogsFromBackend();
                setStatus('Logs imported and written to backend.', 'info');
            } catch (e) {
                alert('Backend import failed.');
            }
        } else {
            alert('File does not contain valid logs array.');
        }
    });
}

function clearLogsFromLocal() {
    state.logs = [];
    saveState();
    refreshLogs();
}

function loadState() {
    const s = localStorage.getItem('clockAppState');
    if (s) {
        state = JSON.parse(s);
        state.clockInTime = state.clockInTime ? new Date(state.clockInTime) : null;
        state.clockOutTime = state.clockOutTime ? new Date(state.clockOutTime) : null;
        state.breakStartTime = state.breakStartTime ? new Date(state.breakStartTime) : null;
        if (!state.logFilter) state.logFilter = { from: null, to: null };
        else {
            state.logFilter.from = state.logFilter.from ? new Date(state.logFilter.from) : null;
            state.logFilter.to = state.logFilter.to ? new Date(state.logFilter.to) : null;
        }
    }
}
function saveState() {
    localStorage.setItem('clockAppState', JSON.stringify(state));
}

function leading(n, len = 2) {
    return n.toString().padStart(len, '0');
}
function formatTime(dt) {
    return dt instanceof Date ? dt.toLocaleTimeString() : '--:--:--';
}
function formatDate(dt) {
    if (!(dt instanceof Date)) return '';
    return `${dt.getFullYear()}-${leading(dt.getMonth() + 1)}-${leading(dt.getDate())}`;
}
function formatDateTimeLocal(dt) {
    if (!(dt instanceof Date)) return '';
    return `${dt.getFullYear()}-${leading(dt.getMonth() + 1)}-${leading(dt.getDate())}T${leading(
        dt.getHours()
    )}:${leading(dt.getMinutes())}`;
}
function formatDateInputValue(dt) {
    if (!(dt instanceof Date)) return '';
    return `${dt.getFullYear()}-${leading(dt.getMonth() + 1)}-${leading(dt.getDate())}`;
}
function formatDatetimeInputValue(dt) {
    if (!(dt instanceof Date)) return '';
    return `${dt.getFullYear()}-${leading(dt.getMonth() + 1)}-${leading(dt.getDate())}T${leading(
        dt.getHours()
    )}:${leading(dt.getMinutes())}`;
}
function formatDuration(sec) {
    const h = Math.floor(sec / 3600),
        m = Math.floor((sec % 3600) / 60),
        s = sec % 60;
    return `${leading(h)}:${leading(m)}:${leading(s)}`;
}

async function addLog(action, detail = '') {
    const now = new Date();
    const log = {
        time: now.toISOString(),
        action: action,
        detail: detail
    };
    state.logs.unshift(log);
    state.logs = state.logs.slice(0, 20);
    await saveLogToBackend(log);
    saveState();
    refreshLogs();
}

function filterLogs(logs) {
    let out = logs;
    if (state.logFilter) {
        const fromDt = state.logFilter.from ? new Date(state.logFilter.from) : null;
        const toDt = state.logFilter.to ? new Date(state.logFilter.to) : null;
        if (fromDt) {
            out = out.filter((l) => new Date(l.time) >= fromDt);
        }
        if (toDt) {
            // Include logs that are <= selected to date/time
            out = out.filter((l) => new Date(l.time) <= toDt);
        }
    }
    return out;
}

function renderLogsFilterControls() {
    let filterPanel = document.getElementById('logsFilterPanel');
    if (!filterPanel) {
        filterPanel = document.createElement('div');
        filterPanel.id = 'logsFilterPanel';
        filterPanel.className = 'mb-2';
        filterPanel.innerHTML = `
            <form class="form-inline" style="display: flex; flex-wrap: wrap; gap: 10px; align-items: center;">
                <label class="mr-1" for="logFrom">From:</label>
                <input id="logFrom" type="datetime-local" class="form-control form-control-sm mr-2"/>
                <label class="mr-1" for="logTo">To:</label>
                <input id="logTo" type="datetime-local" class="form-control form-control-sm mr-2"/>
                <button id="applyLogFilterBtn" type="button" class="btn btn-secondary btn-sm mr-2">Apply Filter</button>
                <button id="clearLogFilterBtn" type="button" class="btn btn-light btn-sm" style="border:1px solid #bbb;">Clear</button>
            </form>
        `;
        const logsBox = document.getElementById('logs');
        if (logsBox && logsBox.parentNode) {
            logsBox.parentNode.insertBefore(filterPanel, logsBox);
        }
    }
    // Restore input values from state
    const fromInput = document.getElementById('logFrom');
    const toInput = document.getElementById('logTo');
    if (state.logFilter && state.logFilter.from) {
        fromInput.value = formatDatetimeInputValue(new Date(state.logFilter.from));
    } else {
        fromInput.value = '';
    }
    if (state.logFilter && state.logFilter.to) {
        toInput.value = formatDatetimeInputValue(new Date(state.logFilter.to));
    } else {
        toInput.value = '';
    }
    // Events
    document.getElementById('applyLogFilterBtn').onclick = function (e) {
        e.preventDefault();
        const fromVal = fromInput.value;
        const toVal = toInput.value;
        state.logFilter = {
            from: fromVal ? new Date(fromVal) : null,
            to: toVal ? new Date(toVal) : null
        };
        saveState();
        refreshLogs();
    };
    document.getElementById('clearLogFilterBtn').onclick = function (e) {
        e.preventDefault();
        fromInput.value = '';
        toInput.value = '';
        state.logFilter = { from: null, to: null };
        saveState();
        refreshLogs();
    };
}

function refreshLogs() {
    renderLogsFilterControls();
    const logsElem = document.getElementById('logs');
    logsElem.innerHTML = '';
    let logs = state.logs || [];
    logs = filterLogs(logs);

    if (logs.length === 0) {
        logsElem.innerHTML = `<li class="list-group-item text-muted">No logs${
            state.logFilter && (state.logFilter.from || state.logFilter.to) ? ' for the chosen dates' : ''
        }.</li>`;
    }
    logs.forEach((l) => {
        const dt = new Date(l.time);
        logsElem.innerHTML += `<li class="list-group-item">
          <b>${l.action}</b>
          <span class="text-muted" style="font-size:.9em;"> @ ${formatTime(dt)} (${formatDate(dt)})</span>
          ${l.detail ? `<br><small>${l.detail}</small>` : ''}
        </li>`;
    });
}

function setStatus(msg, type = 'info') {
    const statusElem = document.getElementById('status');
    statusElem.textContent = 'Status: ' + msg;
    statusElem.className = `alert alert-${type}`;
}

function refreshUI() {
    document.getElementById('clockInBtn').disabled = state.isClockedIn;
    document.getElementById('clockOutBtn').disabled = !state.isClockedIn;
    document.getElementById('breakBtn').disabled = !state.isClockedIn;

    const breakBtn = document.getElementById('breakBtn');
    if (!state.isClockedIn) {
        breakBtn.textContent = 'Start Break';
        breakBtn.className = 'btn btn-warning';
    } else if (state.isOnBreak) {
        breakBtn.textContent = 'End Break';
        breakBtn.className = 'btn btn-success';
    } else {
        breakBtn.textContent = 'Start Break';
        breakBtn.className = 'btn btn-warning';
    }
    breakBtn.style.display = state.isClockedIn ? 'inline-block' : 'none';
    document.getElementById('breakTimerBox').className = state.isOnBreak ? 'text-center show' : 'text-center';

    if (state.isClockedIn) {
        document.getElementById('remainingBox').style.display = 'block';
    } else {
        document.getElementById('remainingBox').style.display = 'none';
    }
}

function updateTimers() {
    let breakSec = state.totalBreakSeconds;
    if (state.isOnBreak && state.breakStartTime) {
        breakSec += Math.floor((Date.now() - new Date(state.breakStartTime).getTime()) / 1000);
    }
    document.getElementById('breakTimer').textContent = formatDuration(breakSec);

    let remainSec = '--:--:--';
    if (state.isClockedIn && state.clockInTime) {
        const workSec = Math.floor((Date.now() - new Date(state.clockInTime).getTime()) / 1000);
        const actualWorked = workSec - breakSec;
        let left = WORK_DAY_SECONDS - actualWorked;
        if (left < 0) left = 0;
        remainSec = formatDuration(left);
    }
    document.getElementById('remainingTimer').textContent = remainSec;
}

async function clockIn() {
    if (state.isClockedIn) return;
    state.isClockedIn = true;
    state.isOnBreak = false;
    state.clockInTime = new Date();
    state.clockOutTime = null;
    state.breakStartTime = null;
    state.totalBreakSeconds = 0;
    await addLog('Clock In');
    setStatus('Clocked in successfully.', 'success');
    saveState();
    refreshUI();
}

async function clockOut() {
    if (!state.isClockedIn) return;
    if (state.isOnBreak) {
        await toggleBreak(true, true);
    }
    state.isClockedIn = false;
    state.clockOutTime = new Date();
    await addLog('Clock Out', `Total break time: ${formatDuration(state.totalBreakSeconds)}`);
    setStatus('Clocked out. Have a great rest of your day!', 'primary');
    saveState();
    refreshUI();
}

async function toggleBreak(silent = false, dontLog = false) {
    if (!state.isClockedIn) return;

    if (!state.isOnBreak) {
        state.isOnBreak = true;
        state.breakStartTime = new Date();
        if (!silent && !dontLog) {
            await addLog('Break Start');
            setStatus('Break started.', 'warning');
        }
    } else {
        const breakSecs = Math.floor((new Date() - new Date(state.breakStartTime)) / 1000);
        state.totalBreakSeconds += breakSecs;
        state.isOnBreak = false;
        state.breakStartTime = null;
        if (!silent && !dontLog) {
            await addLog('Break End', `Break duration: ${formatDuration(breakSecs)}`);
            setStatus('Break ended.', 'success');
        }
    }
    saveState();
    refreshUI();
}

function tick() {
    updateTimers();
    setTimeout(tick, 1000);
}

async function main() {
    loadState();
    await fetchLogsFromBackend();
    refreshLogs();
    refreshUI();
    updateTimers();
    setStatus(
        state.isClockedIn ? (state.isOnBreak ? 'On break.' : 'Clocked in.') : 'Ready to clock in.',
        state.isClockedIn ? (state.isOnBreak ? 'warning' : 'success') : 'info'
    );
    tick();

    if (!document.getElementById('saveLogsBtn')) {
        const panel = document.createElement('div');
        panel.style.margin = '10px 0 10px 0';
        panel.innerHTML = `
            <button id="saveLogsBtn" type="button" class="btn btn-secondary" style="margin-right:8px;">Export Logs</button>
            <button id="loadLogsBtn" type="button" class="btn btn-secondary" style="margin-right:8px;">Import Logs</button>
            <button id="clearLogsBtn" type="button" class="btn btn-danger">Clear Logs</button>
            <span class="text-muted" style="margin-left:16px;">Logs are stored in backend database. Export/Import for backup and transfer.</span>
        `;
        const logsBox = document.getElementById('logs');
        if (logsBox && logsBox.parentNode) {
            logsBox.parentNode.insertBefore(panel, logsBox);
        }
        document.getElementById('saveLogsBtn').onclick = saveLogsToBackendFile;
        document.getElementById('loadLogsBtn').onclick = loadLogsFromLocalFile;
        document.getElementById('clearLogsBtn').onclick = async function () {
            if (confirm('Clear all logs forever?')) {
                await clearLogsFromLocal();
                setStatus('Logs cleared.', 'danger');
            }
        };
    }
    renderLogsFilterControls();
}

window.clockIn = clockIn;
window.clockOut = clockOut;
window.toggleBreak = toggleBreak;

main();
