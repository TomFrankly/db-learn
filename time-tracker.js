// ==================== DATABASE SIMULATION ====================

const STORAGE_KEY = 'timeTrackerDB';

class Database {
    constructor() {
        this.tasks = [];
        this.sessions = [];
        this.nextTaskId = 1;
        this.nextSessionId = 1;
        this.queryLog = [];
        this.load();
    }

    // Save to localStorage
    save() {
        const data = {
            tasks: this.tasks,
            sessions: this.sessions,
            nextTaskId: this.nextTaskId,
            nextSessionId: this.nextSessionId
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    // Load from localStorage
    load() {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                const data = JSON.parse(stored);
                this.tasks = data.tasks || [];
                this.sessions = data.sessions || [];
                this.nextTaskId = data.nextTaskId || 1;
                this.nextSessionId = data.nextSessionId || 1;
            } catch (e) {
                console.error('Failed to load data:', e);
            }
        }
    }

    // Clear all data
    clearAll() {
        this.tasks = [];
        this.sessions = [];
        this.nextTaskId = 1;
        this.nextSessionId = 1;
        this.queryLog = [];
        localStorage.removeItem(STORAGE_KEY);
    }

    // Generate IDs
    getNextTaskId() {
        return this.nextTaskId++;
    }

    getNextSessionId() {
        return this.nextSessionId++;
    }

    // Insert a task
    insertTask(task) {
        const id = this.getNextTaskId();
        const newTask = {
            id,
            name: task.name,
            category: task.category,
            status: 'active',
            total_time: 0,
            created_at: new Date().toISOString(),
            completed_at: null
        };
        this.tasks.push(newTask);

        const sql = `INSERT INTO tasks (name, category, status, total_time, created_at, completed_at)
VALUES ('${newTask.name}', '${newTask.category}', '${newTask.status}', ${newTask.total_time}, '${newTask.created_at}', NULL);`;

        this.logQuery('insert', sql);
        this.save();
        return { ...newTask, _animation: 'insert' };
    }

    // Start a work session
    startSession(taskId) {
        const id = this.getNextSessionId();
        const session = {
            id,
            task_id: taskId,
            started_at: new Date().toISOString(),
            ended_at: null,
            duration: null
        };
        this.sessions.push(session);

        const sql = `INSERT INTO work_sessions (task_id, started_at, ended_at, duration)
VALUES (${taskId}, '${session.started_at}', NULL, NULL);`;

        this.logQuery('insert', sql);
        this.save();
        return { ...session, _animation: 'insert' };
    }

    // End a work session
    endSession(sessionId) {
        const session = this.sessions.find(s => s.id === sessionId);
        if (session && !session.ended_at) {
            const endTime = new Date();
            const startTime = new Date(session.started_at);
            const durationMs = endTime - startTime;
            const durationSeconds = Math.floor(durationMs / 1000);

            session.ended_at = endTime.toISOString();
            session.duration = durationSeconds;

            // Update task total time
            const task = this.tasks.find(t => t.id === session.task_id);
            if (task) {
                task.total_time += durationSeconds;

                const sql2 = `UPDATE tasks
SET total_time = ${task.total_time}
WHERE id = ${task.id};`;
                this.logQuery('update', sql2);
            }

            const sql = `UPDATE work_sessions
SET ended_at = '${session.ended_at}', duration = ${session.duration}
WHERE id = ${sessionId};`;

            this.logQuery('update', sql);
            this.save();
            return { ...session, _animation: 'update' };
        }
        return null;
    }

    // Get active session for a task
    getActiveSession(taskId) {
        return this.sessions.find(s => s.task_id === taskId && !s.ended_at);
    }

    // Get any active session
    getAnyActiveSession() {
        return this.sessions.find(s => !s.ended_at);
    }

    // Complete a task
    completeTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (task) {
            task.status = 'completed';
            task.completed_at = new Date().toISOString();

            const sql = `UPDATE tasks
SET status = 'completed', completed_at = '${task.completed_at}'
WHERE id = ${taskId};`;

            this.logQuery('update', sql);
            this.save();
            return { ...task, _animation: 'update' };
        }
        return null;
    }

    // Reopen a task
    reopenTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (task) {
            task.status = 'active';
            task.completed_at = null;

            const sql = `UPDATE tasks
SET status = 'active', completed_at = NULL
WHERE id = ${taskId};`;

            this.logQuery('update', sql);
            this.save();
            return { ...task, _animation: 'update' };
        }
        return null;
    }

    // Delete a task
    deleteTask(taskId) {
        const taskIndex = this.tasks.findIndex(t => t.id === taskId);
        if (taskIndex !== -1) {
            const task = this.tasks[taskIndex];

            // Delete associated sessions
            const sessionsToDelete = this.sessions.filter(s => s.task_id === taskId);
            this.sessions = this.sessions.filter(s => s.task_id !== taskId);

            if (sessionsToDelete.length > 0) {
                const sql1 = `DELETE FROM work_sessions
WHERE task_id = ${taskId};
-- (${sessionsToDelete.length} row(s) affected)`;
                this.logQuery('delete', sql1);
            }

            this.tasks.splice(taskIndex, 1);
            const sql2 = `DELETE FROM tasks
WHERE id = ${taskId};`;
            this.logQuery('delete', sql2);
            this.save();

            return {
                task: { ...task, _animation: 'delete' },
                deletedSessions: sessionsToDelete.map(s => ({ ...s, _animation: 'delete' }))
            };
        }
        return null;
    }

    // Get active tasks
    getActiveTasks() {
        return this.tasks.filter(t => t.status === 'active');
    }

    // Get completed tasks
    getCompletedTasks() {
        return this.tasks.filter(t => t.status === 'completed');
    }

    // Log a query
    logQuery(type, sql) {
        this.queryLog.push({
            type,
            sql,
            timestamp: new Date().toISOString()
        });
    }

    // Clear query log
    clearQueryLog() {
        this.queryLog = [];
    }
}

// ==================== APP STATE ====================

const db = new Database();
let timerInterval = null;
let currentSessionStart = null;

// ==================== CATEGORY ICONS ====================

const categoryIcons = {
    development: '💻',
    design: '🎨',
    meeting: '📅',
    research: '🔍',
    writing: '✍️',
    admin: '📋',
    learning: '📚',
    other: '📦'
};

// ==================== TIME UTILITIES ====================

function formatDuration(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function formatDurationShort(seconds) {
    if (seconds < 60) {
        return `${seconds}s`;
    } else if (seconds < 3600) {
        const mins = Math.floor(seconds / 60);
        return `${mins}m`;
    } else {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        return `${hrs}h ${mins}m`;
    }
}

function getCurrentSessionDuration() {
    if (!currentSessionStart) return 0;
    return Math.floor((new Date() - new Date(currentSessionStart)) / 1000);
}

// ==================== UI RENDERING ====================

function updateClock() {
    const now = new Date();
    document.getElementById('currentTime').textContent = now.toLocaleTimeString();
}

function renderActiveTimer() {
    const activeSession = db.getAnyActiveSession();
    const section = document.getElementById('activeTimerSection');
    const container = document.getElementById('activeTimer');

    if (!activeSession) {
        section.style.display = 'none';
        currentSessionStart = null;
        return;
    }

    currentSessionStart = activeSession.started_at;
    const task = db.tasks.find(t => t.id === activeSession.task_id);
    if (!task) return;

    section.style.display = 'block';

    const duration = getCurrentSessionDuration();
    const icon = categoryIcons[task.category] || '📦';

    container.innerHTML = `
        <div class="active-timer-info">
            <div class="active-timer-icon">${icon}</div>
            <div class="active-timer-details">
                <div class="active-timer-name">${task.name}</div>
                <div class="active-timer-category">${task.category}</div>
            </div>
        </div>
        <div class="active-timer-display">
            <div class="timer-display" id="timerDisplay">${formatDuration(duration)}</div>
            <button class="btn-stop" onclick="stopTimer(${task.id})">⏹ Stop</button>
        </div>
    `;
}

function updateTimerDisplay() {
    const display = document.getElementById('timerDisplay');
    if (display && currentSessionStart) {
        display.textContent = formatDuration(getCurrentSessionDuration());
    }

    // Also update the task item timer if visible
    const activeSession = db.getAnyActiveSession();
    if (activeSession) {
        const taskTimeEl = document.querySelector(`.task-item[data-task-id="${activeSession.task_id}"] .task-time`);
        if (taskTimeEl) {
            const task = db.tasks.find(t => t.id === activeSession.task_id);
            const totalWithCurrent = task.total_time + getCurrentSessionDuration();
            taskTimeEl.textContent = formatDuration(totalWithCurrent);
        }
    }
}

function renderActiveTasks() {
    const container = document.getElementById('activeTasks');
    const tasks = db.getActiveTasks();
    const activeSession = db.getAnyActiveSession();

    if (tasks.length === 0) {
        container.innerHTML = '<div class="empty-state">No active tasks. Add one above!</div>';
        return;
    }

    container.innerHTML = tasks.map(task => {
        const isTracking = activeSession && activeSession.task_id === task.id;
        const icon = categoryIcons[task.category] || '📦';
        const totalTime = isTracking ? task.total_time + getCurrentSessionDuration() : task.total_time;

        return `
            <div class="task-item ${isTracking ? 'tracking' : ''}" data-task-id="${task.id}">
                <div class="task-icon">${icon}</div>
                <div class="task-info">
                    <div class="task-name">${task.name}</div>
                    <div class="task-meta">
                        <span class="task-time ${isTracking ? 'active' : ''}">${formatDuration(totalTime)}</span>
                        <span>${task.category}</span>
                    </div>
                </div>
                <div class="task-actions">
                    ${isTracking
                        ? `<button class="btn-icon stop" onclick="stopTimer(${task.id})" title="Stop">⏹</button>`
                        : `<button class="btn-icon play" onclick="startTimer(${task.id})" title="Start">▶</button>`
                    }
                    <button class="btn-icon complete" onclick="completeTask(${task.id})" title="Complete">✓</button>
                    <button class="btn-icon delete" onclick="deleteTask(${task.id})" title="Delete">🗑</button>
                </div>
            </div>
        `;
    }).join('');
}

function renderCompletedTasks() {
    const container = document.getElementById('completedTasks');
    const tasks = db.getCompletedTasks();

    if (tasks.length === 0) {
        container.innerHTML = '<div class="empty-state">No completed tasks yet.</div>';
        return;
    }

    container.innerHTML = tasks.map(task => {
        const icon = categoryIcons[task.category] || '📦';

        return `
            <div class="task-item completed" data-task-id="${task.id}">
                <div class="task-icon">${icon}</div>
                <div class="task-info">
                    <div class="task-name">${task.name}</div>
                    <div class="task-meta">
                        <span class="task-time">${formatDuration(task.total_time)}</span>
                        <span>${task.category}</span>
                    </div>
                </div>
                <div class="task-actions">
                    <button class="btn-icon" onclick="reopenTask(${task.id})" title="Reopen">↩</button>
                    <button class="btn-icon delete" onclick="deleteTask(${task.id})" title="Delete">🗑</button>
                </div>
            </div>
        `;
    }).join('');
}

function renderTasksTable(animatedRow = null) {
    const tbody = document.getElementById('tasksTableBody');
    const countEl = document.getElementById('tasksCount');

    countEl.textContent = `${db.tasks.length} row${db.tasks.length !== 1 ? 's' : ''}`;

    tbody.innerHTML = db.tasks.map(task => {
        const animClass = animatedRow && animatedRow.id === task.id ? `row-${animatedRow._animation}` : '';
        return `
            <tr class="${animClass}">
                <td><span class="data-id">${task.id}</span></td>
                <td><span class="data-string">${task.name}</span></td>
                <td><span class="data-string">${task.category}</span></td>
                <td><span class="data-status ${task.status}">${task.status}</span></td>
                <td><span class="data-number">${task.total_time}</span></td>
                <td><span class="data-date">${task.created_at}</span></td>
                <td>${task.completed_at ? `<span class="data-date">${task.completed_at}</span>` : '<span class="data-null">NULL</span>'}</td>
            </tr>
        `;
    }).join('');
}

function renderSessionsTable(animatedRow = null, deletedRows = []) {
    const tbody = document.getElementById('sessionsTableBody');
    const countEl = document.getElementById('sessionsCount');

    const allRows = [...db.sessions];
    deletedRows.forEach(row => {
        if (!allRows.find(r => r.id === row.id)) {
            allRows.push(row);
        }
    });

    countEl.textContent = `${db.sessions.length} row${db.sessions.length !== 1 ? 's' : ''}`;

    tbody.innerHTML = allRows.map(session => {
        let animClass = '';
        if (animatedRow && animatedRow.id === session.id) {
            animClass = `row-${animatedRow._animation}`;
        } else if (deletedRows.find(r => r.id === session.id)) {
            animClass = 'row-delete';
        }

        return `
            <tr class="${animClass}">
                <td><span class="data-id">${session.id}</span></td>
                <td><span class="data-fk">${session.task_id}</span></td>
                <td><span class="data-date">${session.started_at}</span></td>
                <td>${session.ended_at ? `<span class="data-date">${session.ended_at}</span>` : '<span class="data-null">NULL</span>'}</td>
                <td>${session.duration !== null ? `<span class="data-number">${session.duration}</span>` : '<span class="data-null">NULL</span>'}</td>
            </tr>
        `;
    }).join('');

    if (deletedRows.length > 0) {
        setTimeout(() => {
            renderSessionsTable();
        }, 500);
    }
}

function renderQueryLog() {
    const container = document.getElementById('queryLog');

    if (db.queryLog.length === 0) {
        container.innerHTML = '<div class="empty-state">Queries will appear here as you interact with the app</div>';
        return;
    }

    container.innerHTML = db.queryLog.slice().reverse().map(entry => {
        const time = new Date(entry.timestamp).toLocaleTimeString();
        const formattedSql = formatSql(entry.sql);
        return `
            <div class="query-entry ${entry.type}">
                <div class="query-time">${time}</div>
                <div class="query-sql">${formattedSql}</div>
            </div>
        `;
    }).join('');

    container.scrollTop = 0;
}

function formatSql(sql) {
    const keywords = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'FROM', 'WHERE', 'INTO', 'VALUES', 'SET', 'AND', 'OR', 'ORDER BY', 'GROUP BY', 'LIKE', 'IN', 'NULL'];
    const tables = ['tasks', 'work_sessions'];

    let formatted = sql;
    formatted = formatted.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    keywords.forEach(kw => {
        const regex = new RegExp(`\\b${kw}\\b`, 'gi');
        formatted = formatted.replace(regex, `<span class="keyword">${kw}</span>`);
    });

    tables.forEach(table => {
        const regex = new RegExp(`\\b${table}\\b`, 'gi');
        formatted = formatted.replace(regex, `<span class="table-name">${table}</span>`);
    });

    return formatted;
}

// ==================== TIMER ACTIONS ====================

function startTimer(taskId) {
    // Stop any active session first
    const activeSession = db.getAnyActiveSession();
    if (activeSession) {
        const endedSession = db.endSession(activeSession.id);
        renderSessionsTable(endedSession);
        renderTasksTable({ id: activeSession.task_id, _animation: 'update' });
    }

    // Start new session
    const newSession = db.startSession(taskId);
    currentSessionStart = newSession.started_at;

    renderActiveTimer();
    renderActiveTasks();
    renderSessionsTable(newSession);
    renderQueryLog();

    // Start timer interval if not running
    if (!timerInterval) {
        timerInterval = setInterval(() => {
            updateTimerDisplay();
        }, 1000);
    }
}

function stopTimer(taskId) {
    const activeSession = db.getActiveSession(taskId);
    if (activeSession) {
        const endedSession = db.endSession(activeSession.id);
        currentSessionStart = null;

        // Stop interval if no active sessions
        if (!db.getAnyActiveSession() && timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }

        renderActiveTimer();
        renderActiveTasks();
        renderSessionsTable(endedSession);
        renderTasksTable({ id: taskId, _animation: 'update' });
        renderQueryLog();
    }
}

function completeTask(taskId) {
    // Stop timer if running on this task
    const activeSession = db.getActiveSession(taskId);
    if (activeSession) {
        db.endSession(activeSession.id);
        currentSessionStart = null;

        if (!db.getAnyActiveSession() && timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }

    const updatedTask = db.completeTask(taskId);

    renderActiveTimer();
    renderActiveTasks();
    renderCompletedTasks();
    renderTasksTable(updatedTask);
    renderSessionsTable();
    renderQueryLog();
}

function reopenTask(taskId) {
    const updatedTask = db.reopenTask(taskId);

    renderActiveTasks();
    renderCompletedTasks();
    renderTasksTable(updatedTask);
    renderQueryLog();
}

function deleteTask(taskId) {
    // Stop timer if running on this task
    const activeSession = db.getActiveSession(taskId);
    if (activeSession) {
        currentSessionStart = null;
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }

    const result = db.deleteTask(taskId);

    if (result) {
        renderTasksTable(result.task);
        renderSessionsTable(null, result.deletedSessions);

        setTimeout(() => {
            renderTasksTable();
            renderActiveTimer();
            renderActiveTasks();
            renderCompletedTasks();
        }, 500);
    }

    renderQueryLog();
}

// ==================== EVENT HANDLERS ====================

document.getElementById('addTaskForm').addEventListener('submit', function(e) {
    e.preventDefault();

    const name = document.getElementById('taskName').value.trim();
    const category = document.getElementById('taskCategory').value;

    const newTask = db.insertTask({ name, category });

    renderTasksTable(newTask);
    renderActiveTasks();
    renderQueryLog();

    this.reset();
});

document.getElementById('clearQueryLog').addEventListener('click', function() {
    db.clearQueryLog();
    renderQueryLog();
});

// ==================== INITIALIZATION ====================

function seedSampleTasks() {
    if (db.tasks.length > 0) return;

    const sampleTasks = [
        { name: 'Design new landing page', category: 'design' },
        { name: 'Fix login bug', category: 'development' },
        { name: 'Weekly team standup', category: 'meeting' },
        { name: 'Research competitor pricing', category: 'research' },
        { name: 'Write blog post draft', category: 'writing' },
    ];

    sampleTasks.forEach(task => {
        const id = db.getNextTaskId();
        db.tasks.push({
            id,
            name: task.name,
            category: task.category,
            status: 'active',
            total_time: 0,
            created_at: new Date().toISOString(),
            completed_at: null
        });
    });

    db.save();
}

function init() {
    seedSampleTasks();

    // Check for any active session on load
    const activeSession = db.getAnyActiveSession();
    if (activeSession) {
        currentSessionStart = activeSession.started_at;
        timerInterval = setInterval(() => {
            updateTimerDisplay();
        }, 1000);
    }

    // Update clock every second
    setInterval(updateClock, 1000);
    updateClock();

    renderActiveTimer();
    renderActiveTasks();
    renderCompletedTasks();
    renderTasksTable();
    renderSessionsTable();
    renderQueryLog();
}

// Start the app
init();

// ==================== ERD MODAL ====================

document.getElementById('openErdBtn').addEventListener('click', function() {
    document.getElementById('erdModal').classList.add('active');
});

document.getElementById('closeErdBtn').addEventListener('click', function() {
    document.getElementById('erdModal').classList.remove('active');
});

document.getElementById('erdModal').addEventListener('click', function(e) {
    if (e.target === this) {
        this.classList.remove('active');
    }
});

// Close modal on Escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        document.getElementById('erdModal').classList.remove('active');
    }
});
