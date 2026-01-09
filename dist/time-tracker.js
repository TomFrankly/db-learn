// ==================== TIME TRACKER MODULE ====================
// DB Learn v1.0 - Time tracking with database visualization

const TimeTracker = {
    STORAGE_KEY: 'timeTrackerDB',
    tasks: [],
    sessions: [],
    nextTaskId: 1,
    nextSessionId: 1,
    queryLog: [],
    timerInterval: null,
    currentSessionStart: null,
    selectedTaskId: null, // For highlighting task/session relationships

    // ==================== DATABASE OPERATIONS ====================

    save() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
            tasks: this.tasks,
            sessions: this.sessions,
            nextTaskId: this.nextTaskId,
            nextSessionId: this.nextSessionId
        }));
    },

    load() {
        const stored = localStorage.getItem(this.STORAGE_KEY);
        if (stored) {
            try {
                const data = JSON.parse(stored);
                this.tasks = data.tasks || [];
                this.sessions = data.sessions || [];
                this.nextTaskId = data.nextTaskId || 1;
                this.nextSessionId = data.nextSessionId || 1;
            } catch (e) {
                console.error('Failed to load time tracker data:', e);
            }
        }
    },

    clearAll() {
        this.tasks = [];
        this.sessions = [];
        this.nextTaskId = 1;
        this.nextSessionId = 1;
        this.queryLog = [];
        localStorage.removeItem(this.STORAGE_KEY);
    },

    // Insert task
    insertTask(task) {
        const id = this.nextTaskId++;
        const newTask = {
            id,
            name: task.name,
            category: task.category,
            status: 'active',
            created_at: new Date().toISOString(),
            completed_at: null
        };
        this.tasks.push(newTask);

        this.logQuery('insert', `INSERT INTO tasks (name, category, status, created_at)
VALUES ('${newTask.name}', '${newTask.category}', '${newTask.status}', '${newTask.created_at}');`);

        this.save();
        return { ...newTask, _animation: 'insert' };
    },

    // Start session
    startSession(taskId) {
        const id = this.nextSessionId++;
        const session = {
            id,
            task_id: taskId,
            started_at: new Date().toISOString(),
            ended_at: null,
            duration: null
        };
        this.sessions.push(session);

        this.logQuery('insert', `INSERT INTO work_sessions (task_id, started_at)
VALUES (${taskId}, '${session.started_at}');`);

        this.save();
        return { ...session, _animation: 'insert' };
    },

    // End session
    endSession(sessionId) {
        const session = this.sessions.find(s => s.id === sessionId);
        if (session && !session.ended_at) {
            const endTime = new Date();
            const startTime = new Date(session.started_at);
            const durationSeconds = Math.floor((endTime - startTime) / 1000);

            session.ended_at = endTime.toISOString();
            session.duration = durationSeconds;

            this.logQuery('update', `UPDATE work_sessions SET ended_at = '${session.ended_at}', duration = ${session.duration} WHERE id = ${sessionId};`);

            // Show the aggregation query that computes total_time
            const totalTime = this.getTotalTime(session.task_id);
            this.logQuery('select', `SELECT SUM(duration) as total_time FROM work_sessions WHERE task_id = ${session.task_id};
-- Result: ${totalTime} seconds`);

            this.save();
            return { ...session, _animation: 'update' };
        }
        return null;
    },

    // Compute total time for a task from its sessions (normalized approach)
    getTotalTime(taskId) {
        return this.sessions
            .filter(s => s.task_id === taskId && s.duration !== null)
            .reduce((sum, s) => sum + s.duration, 0);
    },

    getActiveSession(taskId) {
        return this.sessions.find(s => s.task_id === taskId && !s.ended_at);
    },

    getAnyActiveSession() {
        return this.sessions.find(s => !s.ended_at);
    },

    completeTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (task) {
            task.status = 'completed';
            task.completed_at = new Date().toISOString();
            this.logQuery('update', `UPDATE tasks SET status = 'completed', completed_at = '${task.completed_at}' WHERE id = ${taskId};`);
            this.save();
            return { ...task, _animation: 'update' };
        }
        return null;
    },

    reopenTask(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (task) {
            task.status = 'active';
            task.completed_at = null;
            this.logQuery('update', `UPDATE tasks SET status = 'active', completed_at = NULL WHERE id = ${taskId};`);
            this.save();
            return { ...task, _animation: 'update' };
        }
        return null;
    },

    deleteTask(taskId) {
        const taskIndex = this.tasks.findIndex(t => t.id === taskId);
        if (taskIndex !== -1) {
            const task = this.tasks[taskIndex];
            const sessionsToDelete = this.sessions.filter(s => s.task_id === taskId);
            this.sessions = this.sessions.filter(s => s.task_id !== taskId);

            if (sessionsToDelete.length > 0) {
                this.logQuery('delete', `DELETE FROM work_sessions WHERE task_id = ${taskId}; -- ${sessionsToDelete.length} row(s)`);
            }

            this.tasks.splice(taskIndex, 1);
            this.logQuery('delete', `DELETE FROM tasks WHERE id = ${taskId};`);
            this.save();

            return {
                task: { ...task, _animation: 'delete' },
                deletedSessions: sessionsToDelete.map(s => ({ ...s, _animation: 'delete' }))
            };
        }
        return null;
    },

    getActiveTasks() {
        return this.tasks.filter(t => t.status === 'active');
    },

    getCompletedTasks() {
        return this.tasks.filter(t => t.status === 'completed');
    },

    logQuery(type, sql) {
        this.queryLog.push({ type, sql, timestamp: new Date().toISOString() });
    },

    clearQueryLog() {
        this.queryLog = [];
    },

    // ==================== TIMER MANAGEMENT ====================

    getCurrentSessionDuration() {
        if (!this.currentSessionStart) return 0;
        return Math.floor((new Date() - new Date(this.currentSessionStart)) / 1000);
    },

    startTimer(taskId) {
        // Stop any active session first
        const activeSession = this.getAnyActiveSession();
        if (activeSession) {
            this.endSession(activeSession.id);
        }

        // Start new session
        const newSession = this.startSession(taskId);
        this.currentSessionStart = newSession.started_at;

        // Start interval
        if (!this.timerInterval) {
            this.timerInterval = setInterval(() => this.updateTimerDisplay(), 1000);
        }

        this.render();
    },

    stopTimer(taskId) {
        const activeSession = this.getActiveSession(taskId);
        if (activeSession) {
            this.endSession(activeSession.id);
            this.currentSessionStart = null;

            if (!this.getAnyActiveSession() && this.timerInterval) {
                clearInterval(this.timerInterval);
                this.timerInterval = null;
            }

            this.render();
        }
    },

    updateTimerDisplay() {
        const display = document.getElementById('ttTimerDisplay');
        if (display && this.currentSessionStart) {
            display.textContent = formatDuration(this.getCurrentSessionDuration());
        }

        // Update task time in list
        const activeSession = this.getAnyActiveSession();
        if (activeSession) {
            const timeEl = document.querySelector(`[data-task-time="${activeSession.task_id}"]`);
            if (timeEl) {
                const totalTime = this.getTotalTime(activeSession.task_id);
                timeEl.textContent = formatDuration(totalTime + this.getCurrentSessionDuration());
            }
        }
    },

    // ==================== UI RENDERING ====================

    render() {
        this.renderAppContent();
        this.renderDbContent();
    },

    renderAppContent() {
        const container = document.getElementById('appContent');
        if (!container) return;

        const activeSession = this.getAnyActiveSession();
        const activeTasks = this.getActiveTasks();
        const completedTasks = this.getCompletedTasks();

        let activeTimerHtml = '';
        if (activeSession) {
            const task = this.tasks.find(t => t.id === activeSession.task_id);
            if (task) {
                const icon = categoryIcons[task.category] || '📦';
                activeTimerHtml = `
                    <div class="bg-success/10 border-b border-success/30 p-4">
                        <h2 class="text-xs uppercase tracking-wider text-success font-semibold mb-3">Currently Tracking</h2>
                        <div class="bg-base-300 rounded-lg p-4 border border-success/30">
                            <div class="flex items-center gap-3 mb-3">
                                <div class="w-10 h-10 rounded-lg bg-success/20 flex items-center justify-center text-lg">${icon}</div>
                                <div class="flex-1">
                                    <div class="font-semibold">${task.name}</div>
                                    <div class="text-xs text-neutral-content">${task.category}</div>
                                </div>
                            </div>
                            <div class="flex items-center justify-between">
                                <div id="ttTimerDisplay" class="font-mono text-2xl font-bold text-success">${formatDuration(this.getCurrentSessionDuration())}</div>
                                <button class="btn btn-error btn-sm" onclick="TimeTracker.stopTimer(${task.id})">Stop</button>
                            </div>
                        </div>
                    </div>
                `;
            }
        }

        const self = this;
        const taskItem = (task, isActive) => {
            const icon = categoryIcons[task.category] || '📦';
            const isTracking = activeSession && activeSession.task_id === task.id;
            const baseTime = self.getTotalTime(task.id);
            const totalTime = isTracking ? baseTime + self.getCurrentSessionDuration() : baseTime;
            const sessionCount = self.sessions.filter(s => s.task_id === task.id).length;

            return `
                <div class="flex items-center gap-3 p-3 bg-base-300 rounded-lg ${isTracking ? 'ring-1 ring-success' : ''}">
                    <div class="w-10 h-10 rounded-lg bg-base-100 flex items-center justify-center">${icon}</div>
                    <div class="flex-1 min-w-0">
                        <div class="font-medium truncate">${task.name}</div>
                        <div class="flex items-center gap-2 text-xs text-neutral-content">
                            <span class="font-mono ${isTracking ? 'text-success' : ''}" data-task-time="${task.id}">${formatDuration(totalTime)}</span>
                            <span>•</span>
                            <span>${task.category}</span>
                        </div>
                    </div>
                    <div class="flex gap-1">
                        ${isActive ? (isTracking
                            ? `<button class="btn btn-xs btn-warning btn-square" onclick="TimeTracker.stopTimer(${task.id})">⏹</button>`
                            : `<button class="btn btn-xs btn-success btn-square" onclick="TimeTracker.startTimer(${task.id})">▶</button>`
                        ) : ''}
                        <button class="btn btn-xs btn-ghost btn-square" onclick="TimeTracker.openSessionsModal(${task.id})" title="View sessions (${sessionCount})">📊</button>
                        ${isActive
                            ? `<button class="btn btn-xs btn-ghost btn-square" onclick="TimeTracker.completeTaskAction(${task.id})">✓</button>`
                            : `<button class="btn btn-xs btn-ghost btn-square" onclick="TimeTracker.reopenTaskAction(${task.id})">↩</button>`
                        }
                        <button class="btn btn-xs btn-ghost btn-square text-error" onclick="TimeTracker.deleteTaskAction(${task.id})">🗑</button>
                    </div>
                </div>
            `;
        };

        container.innerHTML = `
            ${activeTimerHtml}
            <div class="p-4 space-y-6">
                <!-- Add Task Form -->
                <div>
                    <h2 class="text-xs uppercase tracking-wider text-neutral-content font-semibold mb-3">Add New Task</h2>
                    <form id="ttAddTaskForm" class="space-y-3">
                        <input type="text" name="taskName" placeholder="Task name..." class="input input-bordered input-sm w-full bg-base-300" required>
                        <select name="category" class="select select-bordered select-sm w-full bg-base-300">
                            <option value="development">💻 Development</option>
                            <option value="design">🎨 Design</option>
                            <option value="meeting">📅 Meeting</option>
                            <option value="research">🔍 Research</option>
                            <option value="writing">✍️ Writing</option>
                            <option value="admin">📋 Admin</option>
                            <option value="learning">📚 Learning</option>
                            <option value="other">📦 Other</option>
                        </select>
                        <button type="submit" class="btn btn-primary btn-sm w-full">Add Task</button>
                    </form>
                </div>

                <!-- Active Tasks -->
                <div>
                    <h2 class="text-xs uppercase tracking-wider text-neutral-content font-semibold mb-3">Active Tasks</h2>
                    <div class="space-y-2">
                        ${activeTasks.length
                            ? activeTasks.map(t => taskItem(t, true)).join('')
                            : '<div class="text-center text-neutral-content/50 py-4 text-sm">No active tasks</div>'
                        }
                    </div>
                </div>

                <!-- Completed Tasks -->
                ${completedTasks.length ? `
                    <div>
                        <h2 class="text-xs uppercase tracking-wider text-neutral-content font-semibold mb-3">Completed</h2>
                        <div class="space-y-2 opacity-60">
                            ${completedTasks.map(t => taskItem(t, false)).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;

        // Bind form
        document.getElementById('ttAddTaskForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const form = e.target;
            const name = form.taskName.value.trim();
            const category = form.category.value;
            if (name) {
                this.insertTask({ name, category });
                form.reset();
                this.render();
            }
        });
    },

    renderDbContent() {
        const container = document.getElementById('dbContent');
        if (!container) return;

        container.innerHTML = `
            <div id="ttTasksTable"></div>
            <div id="ttSessionsTable"></div>
            <div id="ttQueryLog"></div>
        `;

        const self = this;

        // Get highlighted IDs based on selected task
        const highlightedTaskIds = this.selectedTaskId ? new Set([this.selectedTaskId]) : new Set();
        const highlightedSessionIds = this.selectedTaskId
            ? new Set(this.sessions.filter(s => s.task_id === this.selectedTaskId).map(s => s.id))
            : new Set();

        // Tasks table - note: total_time is computed, not stored
        renderDbTable('ttTasksTable', 'tasks', [
            { key: 'id', label: 'id', type: 'id' },
            { key: 'name', label: 'name' },
            { key: 'category', label: 'category' },
            { key: 'status', label: 'status', type: 'status' },
            { key: 'created_at', label: 'created_at', type: 'date' },
            { key: 'completed_at', label: 'completed_at', type: 'date' }
        ], this.tasks, null, [], {
            onRowClick: (taskId) => self.selectTask(taskId),
            highlightIds: highlightedTaskIds,
            highlightClass: 'row-highlight'
        });

        // Sessions table
        renderDbTable('ttSessionsTable', 'work_sessions', [
            { key: 'id', label: 'id', type: 'id' },
            { key: 'task_id', label: 'task_id', type: 'fk' },
            { key: 'started_at', label: 'started_at', type: 'date' },
            { key: 'ended_at', label: 'ended_at', type: 'date' },
            { key: 'duration', label: 'duration', type: 'number' }
        ], this.sessions, null, [], {
            highlightIds: highlightedSessionIds,
            highlightClass: 'row-highlight-related'
        });

        // Query log
        renderQueryLog('ttQueryLog', this.queryLog);

        // Render ERD - total_time is not stored, it's computed via SUM(duration)
        renderErd([
            {
                name: 'tasks',
                columns: [
                    { key: 'pk', name: 'id', type: 'INTEGER' },
                    { key: '', name: 'name', type: 'VARCHAR(255)' },
                    { key: '', name: 'category', type: 'VARCHAR(50)' },
                    { key: '', name: 'status', type: 'VARCHAR(20)' },
                    { key: '', name: 'created_at', type: 'TIMESTAMP' },
                    { key: '', name: 'completed_at', type: 'TIMESTAMP' }
                ]
            },
            {
                name: 'work_sessions',
                columns: [
                    { key: 'pk', name: 'id', type: 'INTEGER' },
                    { key: 'fk', name: 'task_id', type: 'INTEGER' },
                    { key: '', name: 'started_at', type: 'TIMESTAMP' },
                    { key: '', name: 'ended_at', type: 'TIMESTAMP' },
                    { key: '', name: 'duration', type: 'INTEGER' }
                ]
            }
        ]);
    },

    selectTask(taskId) {
        // Toggle selection - clicking same task deselects it
        this.selectedTaskId = this.selectedTaskId === taskId ? null : taskId;
        this.renderDbContent(); // Re-render just the db content to update highlights
    },

    // Action wrappers
    completeTaskAction(taskId) {
        const activeSession = this.getActiveSession(taskId);
        if (activeSession) {
            this.endSession(activeSession.id);
            this.currentSessionStart = null;
            if (this.timerInterval) {
                clearInterval(this.timerInterval);
                this.timerInterval = null;
            }
        }
        this.completeTask(taskId);
        this.render();
    },

    reopenTaskAction(taskId) {
        this.reopenTask(taskId);
        this.render();
    },

    deleteTaskAction(taskId) {
        const activeSession = this.getActiveSession(taskId);
        if (activeSession) {
            this.currentSessionStart = null;
            if (this.timerInterval) {
                clearInterval(this.timerInterval);
                this.timerInterval = null;
            }
        }
        this.deleteTask(taskId);
        this.render();
    },

    openSessionsModal(taskId) {
        const task = this.tasks.find(t => t.id === taskId);
        if (!task) return;

        const sessions = this.sessions.filter(s => s.task_id === taskId);
        const totalTime = this.getTotalTime(taskId);

        // Update modal title
        document.getElementById('sessionsModalTitle').textContent = `Work Sessions: ${task.name}`;

        // Build sessions table
        const sessionRows = sessions.map(s => {
            const startTime = new Date(s.started_at).toLocaleString();
            const endTime = s.ended_at ? new Date(s.ended_at).toLocaleString() : 'In progress';
            const duration = s.duration !== null ? s.duration : '—';
            return `
                <tr>
                    <td class="font-mono text-xs"><span class="data-id">${s.id}</span></td>
                    <td class="text-xs">${startTime}</td>
                    <td class="text-xs">${endTime}</td>
                    <td class="font-mono text-xs text-right"><span class="data-number">${duration}</span></td>
                </tr>
            `;
        }).join('');

        const content = `
            <!-- Total Time Calculation -->
            <div class="bg-info/10 border border-info/30 rounded-lg p-4 mb-4">
                <div class="text-xs text-info font-semibold uppercase tracking-wider mb-2">Computed Total Time</div>
                <div class="flex items-baseline gap-3">
                    <span class="font-mono text-2xl font-bold text-info">${totalTime}</span>
                    <span class="text-neutral-content text-sm">seconds</span>
                    <span class="text-neutral-content/60 text-sm">(${formatDuration(totalTime)})</span>
                </div>
                <div class="mt-3 p-2 bg-base-300 rounded font-mono text-xs">
                    <span class="sql-keyword">SELECT</span> <span class="sql-keyword">SUM</span>(duration) <span class="sql-keyword">AS</span> total_time<br>
                    <span class="sql-keyword">FROM</span> work_sessions<br>
                    <span class="sql-keyword">WHERE</span> task_id = <span class="data-fk">${taskId}</span>;
                </div>
            </div>

            <!-- Sessions Table -->
            <div class="bg-base-300 rounded-lg overflow-hidden">
                <table class="table table-xs font-mono w-full">
                    <thead>
                        <tr class="bg-base-100">
                            <th class="text-xs">id</th>
                            <th class="text-xs">started_at</th>
                            <th class="text-xs">ended_at</th>
                            <th class="text-xs text-right">duration (s)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${sessionRows.length ? sessionRows : '<tr><td colspan="4" class="text-center text-neutral-content/50 py-4">No sessions recorded</td></tr>'}
                    </tbody>
                    ${sessions.length > 0 ? `
                    <tfoot class="border-t-2 border-info/30">
                        <tr class="bg-info/5">
                            <td colspan="3" class="text-right font-semibold text-info text-xs">SUM(duration) =</td>
                            <td class="font-mono font-bold text-info text-right">${totalTime}</td>
                        </tr>
                    </tfoot>
                    ` : ''}
                </table>
            </div>

            <div class="mt-4 text-xs text-neutral-content/60 text-center">
                Click a row in the tasks table to highlight related sessions
            </div>
        `;

        document.getElementById('sessionsModalContent').innerHTML = content;
        document.getElementById('sessionsModal').showModal();
    },

    // ==================== INITIALIZATION ====================

    init() {
        this.load();

        // Seed sample data if empty
        if (this.tasks.length === 0) {
            const samples = [
                { name: 'Design new landing page', category: 'design' },
                { name: 'Fix login bug', category: 'development' },
                { name: 'Weekly team standup', category: 'meeting' },
                { name: 'Research competitor pricing', category: 'research' },
                { name: 'Write blog post draft', category: 'writing' }
            ];
            samples.forEach(t => {
                const id = this.nextTaskId++;
                this.tasks.push({
                    id,
                    name: t.name,
                    category: t.category,
                    status: 'active',
                    created_at: new Date().toISOString(),
                    completed_at: null
                });
            });
            this.save();
        }

        // Resume timer if active session exists
        const activeSession = this.getAnyActiveSession();
        if (activeSession) {
            this.currentSessionStart = activeSession.started_at;
            this.timerInterval = setInterval(() => this.updateTimerDisplay(), 1000);
        }

        this.render();
    },

    cleanup() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }
};

// Global query log clear
function clearQueryLog() {
    if (typeof currentTool !== 'undefined' && currentTool === 'time-tracker') {
        TimeTracker.clearQueryLog();
        TimeTracker.render();
    } else if (typeof currentTool !== 'undefined' && currentTool === 'habit-tracker') {
        HabitTracker.clearQueryLog();
        HabitTracker.render();
    }
}
