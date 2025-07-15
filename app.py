import os
import sqlite3
from flask import Flask, render_template_string, jsonify, request, send_from_directory, g, Response
from datetime import datetime
from flask_cors import CORS
import csv
import io

app = Flask(__name__)
CORS(app)

DB_FILE = "clocklogs.db"

def get_db():
    if "db" not in g:
        db = sqlite3.connect(DB_FILE)
        db.row_factory = sqlite3.Row
        g.db = db
    return g.db

@app.teardown_appcontext
def close_db(error):
    db = g.pop("db", None)
    if db is not None:
        db.close()

def init_db():
    with app.app_context():
        db = get_db()
        c = db.cursor()
        c.execute('''
        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            time DATETIME NOT NULL
        )
    ''')
        db.commit()
init_db()

ACTION_SEQUENCE = {
    None:      ["Clock In"],
    "Clock Out":     ["Clock In"],
    "Clock In":      ["Break Start", "Clock Out"],
    "Break Start": ["Break End"],
    "Break End":   ["Break Start", "Clock Out", "Break End"],
}

def query_logs():
    db = get_db()
    c = db.cursor()
    c.execute("SELECT action, time FROM logs ORDER BY id")
    rows = [dict(x) for x in c.fetchall()]
    return rows

def insert_log(action, time):
    db = get_db()
    c = db.cursor()
    c.execute("INSERT INTO logs (action, time) VALUES (?, ?)", (action, time))
    db.commit()
def get_last_action(logs):
    return logs[-1]['action'] if logs else None

def get_last_break_start_time(logs):
    for row in reversed(logs):
        if row['action'] == 'Break Start':
            return row['time']
    return None

def get_latest_unused_break_start(logs):
    last_break_end_id = None
    break_starts = []
    for idx, row in enumerate(logs):
        if row['action'] == 'Break End':
            last_break_end_id = idx
    for idx, row in enumerate(logs):
        if row['action'] == 'Break Start' and (last_break_end_id is None or idx > last_break_end_id):
            break_starts.append({"id": idx, "time": row["time"]})
    if break_starts:
        return break_starts[-1]
    return None

def get_next_actions(last_action, logs):
    if last_action == "Break Start":
        last_break_start = None
        for idx in reversed(range(len(logs))):
            if logs[idx]['action'] == 'Break Start':
                last_break_start = idx
                break
        if last_break_start is not None:
            later_break_end = False
            for idx in range(last_break_start + 1, len(logs)):
                if logs[idx]['action'] == 'Break End':
                    later_break_end = True
                    break
            if not later_break_end:
                return ["Break End"]
        return []
    if last_action == "Break End":
        latest_unused_break_start = get_latest_unused_break_start(logs)
        if latest_unused_break_start is not None:
            return ["Break Start", "Clock Out"]
        return ["Break Start", "Clock Out"]
    return ACTION_SEQUENCE.get(last_action, [])

def make_status_state(last_action, logs):
    next_actions = get_next_actions(last_action, logs)
    state = {
        "clockin_enabled": "Clock In" in next_actions,
        "clockout_enabled": "Clock Out" in next_actions,
        "break_start_enabled": "Break Start" in next_actions,
        "break_end_enabled": "Break End" in next_actions,
        "last_action": last_action if last_action else None,
    }
    if last_action is None or last_action == "Clock Out":
        state["status"] = "Not Clocked In"
        state["break_timer"] = None
    elif last_action == "Clock In":
        state["status"] = "Clocked In"
        state["break_timer"] = None
    elif last_action == "Break Start":
        state["status"] = "On Break"
        last_break_start = get_last_break_start_time(logs)
        state["break_timer"] = last_break_start
    elif last_action == "Break End":
        state["status"] = "Clocked In"
        state["break_timer"] = None
    else:
        state["status"] = "Unknown State"
        state["break_timer"] = None
    return state

@app.route("/")
def index():
    return render_template_string('''
    <!doctype html>
    <html>
    <head>
        <title>Clock In/Out (Server DB Storage)</title>
        <style>
        button[disabled] { color: #bbb; }
        </style>
    </head>
    <body>
        <h1>Status: <span id="status"></span></h1>
        <div>
            <span id="break-timer" style="display:none;">
                Break started at: <span id="break-start-time"></span> (<span id="elapsed"></span> elapsed)
            </span>
        </div>
        <div>
            <button id="clockin" onclick="doAction('Clock In')">Clock In</button>
            <button id="clockout" onclick="doAction('Clock Out')">Clock Out</button>
            <button id="break_start" onclick="doAction('Break Start')">Break Start</button>
            <button id="break_end" onclick="doAction('Break End')">Break End</button>
            <button id="export_logs" onclick="exportLogs()">Export Logs</button>
        </div>
        <h2>Log</h2>
        <table border="1" style="min-width: 200px;">
            <thead><tr><th>Action</th><th>Time</th></tr></thead>
            <tbody id="logtable"></tbody>
        </table>
        <script>
        const valid_actions = ["Clock In", "Clock Out", "Break Start", "Break End"];
        const BACKEND_LOGS_EXPORT_ENDPOINT = '/api/logs/export';
        function getLogs() {
            return fetch("/api/logs", {method: "GET"}).then(r=>r.json());
        }
        function getLastAction(logs) {
            if(!logs.length) return null;
            return logs[logs.length-1].action;
        }
        function getLastBreakStartTime(logs) {
            for(let i=logs.length-1;i>=0;i--) {
                if(logs[i].action==="Break Start") return logs[i].time;
            }
            return null;
        }
        function getLatestUnusedBreakStart(logs) {
            let lastBreakEndIdx = -1;
            for(let i=0;i<logs.length;i++) {
                if(logs[i].action==="Break End") lastBreakEndIdx = i;
            }
            let idxs=[];
            for(let i=0;i<logs.length;i++) {
                if(logs[i].action==="Break Start" && i > lastBreakEndIdx)
                    idxs.push({id:i, time:logs[i].time});
            }
            if(idxs.length) return idxs[idxs.length-1];
            return null;
        }
        function getNextActions(last_action, logs) {
            const ACTION_SEQUENCE = {
                null:      ["Clock In"],
                "Clock Out":     ["Clock In"],
                "Clock In":      ["Break Start", "Clock Out"],
                "Break Start": ["Break End"],
                "Break End":   ["Break Start", "Clock Out", "Break End"],
            };
            if(last_action==="Break Start") {
                let last_break_start = null;
                for(let i=logs.length-1;i>=0;i--) {
                    if(logs[i].action==="Break Start") {
                        last_break_start = i;
                        break;
                    }
                }
                if(last_break_start!==null) {
                    let later_break_end = false;
                    for(let i=last_break_start+1;i<logs.length;i++) {
                        if(logs[i].action==="Break End"){ later_break_end=true; break;}
                    }
                    if(!later_break_end) return ["Break End"];
                }
                return [];
            }
            if(last_action==="Break End") {
                const latest_unused = getLatestUnusedBreakStart(logs);
                if(latest_unused!=null)
                    return ["Break Start", "Clock Out"];
                return ["Break Start", "Clock Out"];
            }
            return ACTION_SEQUENCE[last_action] || [];
        }
        function make_status_state(last_action, logs) {
            const next_actions = getNextActions(last_action, logs);
            const state = {
                clockin_enabled: next_actions.indexOf('Clock In') !== -1,
                clockout_enabled: next_actions.indexOf('Clock Out') !== -1,
                break_start_enabled: next_actions.indexOf('Break Start') !== -1,
                break_end_enabled: next_actions.indexOf('Break End') !== -1,
                last_action: last_action ? last_action : null
            };
            if (last_action == null || last_action == "Clock Out") {
                state.status = "Not Clocked In";
                state.break_timer = null;
            } else if (last_action == "Clock In") {
                state.status = "Clocked In";
                state.break_timer = null;
            } else if (last_action == "Break Start") {
                state.status = "On Break";
                let bst = getLastBreakStartTime(logs);
                state.break_timer = bst;
            } else if (last_action == "Break End") {
                state.status = "Clocked In";
                state.break_timer = null;
            } else {
                state.status = "Unknown State";
                state.break_timer = null;
            }
            return state;
        }
        function updateUI() {
            getLogs().then(logs=>{
                const last_action = getLastAction(logs);
                const status = make_status_state(last_action, logs);
                document.getElementById("status").textContent = status.status;
                document.getElementById("clockin").disabled = !status.clockin_enabled;
                document.getElementById("clockout").disabled = !status.clockout_enabled;
                document.getElementById("break_start").disabled = !status.break_start_enabled;
                document.getElementById("break_end").disabled = !status.break_end_enabled;
                let tb = document.getElementById("logtable");
                tb.innerHTML = "";
                for (let i=logs.length-1; i>=0; i--) {
                    let tr = document.createElement("tr");
                    let td1 = document.createElement("td"); td1.textContent = logs[i].action;
                    let td2 = document.createElement("td"); td2.textContent = logs[i].time;
                    tr.appendChild(td1); tr.appendChild(td2);
                    tb.appendChild(tr);
                }
                if(status.status === "On Break" && status.break_timer) {
                    document.getElementById('break-timer').style.display = '';
                    document.getElementById('break-start-time').textContent = status.break_timer;
                    function updateElapsed() {
                        const start = new Date(status.break_timer.replace(/-/g,"/"));
                        const now = new Date();
                        const diffSec = Math.floor((now - start) / 1000);
                        const min = Math.floor(diffSec / 60);
                        const sec = diffSec % 60;
                        document.getElementById('elapsed').textContent =
                            min + 'm ' + sec + 's';
                    }
                    updateElapsed();
                    if(window.breakTimerInterval) clearInterval(window.breakTimerInterval);
                    window.breakTimerInterval = setInterval(updateElapsed, 1000);
                } else {
                    document.getElementById('break-timer').style.display = 'none';
                    if(window.breakTimerInterval) clearInterval(window.breakTimerInterval);
                }
            });
        }
        function doAction(act) {
            if(valid_actions.indexOf(act)===-1) return;
            getLogs().then(logs=>{
                const last_action = getLastAction(logs);
                const next_actions = getNextActions(last_action, logs);
                if(next_actions.indexOf(act) === -1) {
                    alert("Invalid state transition");
                    return;
                }
                fetch("/api/logs", {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    body: JSON.stringify({action: act})
                }).then(()=>updateUI());
            });
        }
        function exportLogs() {
            window.open(BACKEND_LOGS_EXPORT_ENDPOINT, "_blank");
        }
        window.onload = updateUI;
        setInterval(updateUI, 3000);
        </script>
    </body>
    </html>
    ''')

@app.route('/api/logs', methods=['GET'])
def api_logs():
    logs = query_logs()
    return jsonify(logs)

@app.route('/api/logs', methods=["POST"])
def api_log_action():
    data = request.get_json()
    action = data.get("action")
    if action not in ["Break Start", "Break End", "Clock In", "Clock Out"]:
        return jsonify({"ok": False, "error": "Invalid action"}), 400
    logs = query_logs()
    last_action = get_last_action(logs)
    next_actions = get_next_actions(last_action, logs)
    if action not in next_actions:
        return jsonify({"ok": False, "error": "Invalid state transition"}), 400
    now = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    insert_log(action, now)
    return jsonify({"ok": True})

@app.route('/api/logs/export', methods=["GET"])
def export_logs():
    db = get_db()
    cur = db.cursor()
    from_time = request.args.get("from")
    to_time = request.args.get("to")
    query = "SELECT id, action, time FROM logs"
    params = []
    clauses = []
    if from_time:
        clauses.append("time >= ?")
        params.append(from_time)
    if to_time:
        clauses.append("time <= ?")
        params.append(to_time)
    if clauses:
        query += " WHERE " + " AND ".join(clauses)
    query += " ORDER BY id"
    cur.execute(query, params)
    rows = cur.fetchall()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['ID', 'Action', 'Time'])
    for row in rows:
        writer.writerow([row['id'], row['action'], row['time']])
    output.seek(0)
    csv_data = output.getvalue()
    output.close()
    return Response(
        csv_data,
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment;filename=clocklogs.csv"}
    )

@app.route('/<path:path>')
def static_serve(path):
    return send_from_directory('static', path)

if __name__ == "__main__":
    with app.app_context():
        init_db()
    app.run(debug=True, port=5002)