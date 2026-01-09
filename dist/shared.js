// ==================== SHARED DATABASE VISUALIZATION ====================
// DB Learn v1.0 - Shared utilities and rendering

// Format SQL with syntax highlighting
function formatSql(sql) {
    const keywords = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'FROM', 'WHERE', 'INTO', 'VALUES', 'SET', 'AND', 'OR', 'ORDER BY', 'GROUP BY', 'LIKE', 'IN', 'NULL', 'SUM', 'COUNT', 'AVG', 'MIN', 'MAX', 'AS', 'JOIN', 'LEFT JOIN', 'ON'];

    let formatted = sql;
    formatted = formatted.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    keywords.forEach(kw => {
        const regex = new RegExp(`\\b${kw}\\b`, 'gi');
        formatted = formatted.replace(regex, `<span class="sql-keyword">${kw}</span>`);
    });

    return formatted;
}

// Render a database table with animations
// Options: { onRowClick: fn, highlightIds: Set, highlightClass: string }
function renderDbTable(containerId, tableName, columns, rows, animatedRow = null, deletedRows = [], options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const { onRowClick, highlightIds = new Set(), highlightClass = 'row-highlight' } = options;

    const allRows = [...rows];
    deletedRows.forEach(row => {
        if (!allRows.find(r => r.id === row.id)) {
            allRows.push(row);
        }
    });

    const headerCells = columns.map(col =>
        `<th class="bg-base-300 text-neutral-content text-xs font-semibold uppercase tracking-wider">${col.label}</th>`
    ).join('');

    const bodyRows = allRows.map(row => {
        let classes = [];
        if (animatedRow && animatedRow.id === row.id) {
            classes.push(`row-${animatedRow._animation}`);
        } else if (deletedRows.find(r => r.id === row.id)) {
            classes.push('row-delete');
        }
        if (highlightIds.has(row.id)) {
            classes.push(highlightClass);
        }
        if (onRowClick) {
            classes.push('cursor-pointer', 'hover:bg-base-100/50');
        }

        const cells = columns.map(col => {
            const value = row[col.key];
            let displayValue = value;
            let className = '';

            if (value === null || value === undefined) {
                displayValue = 'NULL';
                className = 'data-null';
            } else if (col.type === 'id') {
                className = 'data-id';
            } else if (col.type === 'fk') {
                className = 'data-fk';
            } else if (col.type === 'date') {
                className = 'data-date';
            } else if (col.type === 'number') {
                className = 'data-number';
            } else if (col.type === 'status') {
                const statusClass = value === 'active' ? 'badge-success' : value === 'completed' ? 'badge-info' : 'badge-neutral';
                return `<td><span class="badge badge-sm ${statusClass}">${value}</span></td>`;
            }

            return `<td><span class="${className}">${displayValue}</span></td>`;
        }).join('');

        const clickAttr = onRowClick ? `data-row-id="${row.id}"` : '';
        return `<tr class="${classes.join(' ')}" ${clickAttr}>${cells}</tr>`;
    }).join('');

    container.innerHTML = `
        <div class="bg-base-200 border border-neutral rounded-lg flex flex-col min-h-0 flex-1">
            <div class="px-4 py-3 border-b border-neutral flex justify-between items-center bg-base-300/50">
                <h3 class="font-mono text-sm font-semibold text-neutral-content">${tableName}</h3>
                <span class="text-xs text-neutral-content/60 font-mono">${rows.length} row${rows.length !== 1 ? 's' : ''}</span>
            </div>
            <div class="overflow-auto flex-1">
                <table class="table table-xs font-mono">
                    <thead class="sticky top-0">
                        <tr>${headerCells}</tr>
                    </thead>
                    <tbody>${bodyRows}</tbody>
                </table>
            </div>
        </div>
    `;

    // Bind click handlers if provided
    if (onRowClick) {
        container.querySelectorAll('tr[data-row-id]').forEach(tr => {
            tr.addEventListener('click', () => {
                const rowId = parseInt(tr.dataset.rowId, 10);
                onRowClick(rowId);
            });
        });
    }

    // Clean up deleted rows after animation
    if (deletedRows.length > 0) {
        setTimeout(() => {
            renderDbTable(containerId, tableName, columns, rows, null, [], options);
        }, 500);
    }
}

// Render query log
function renderQueryLog(containerId, queryLog) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const entries = queryLog.slice().reverse().map(entry => {
        const time = new Date(entry.timestamp).toLocaleTimeString();
        const formattedSql = formatSql(entry.sql);
        const typeColors = {
            insert: 'border-l-success',
            update: 'border-l-warning',
            delete: 'border-l-error',
            select: 'border-l-info'
        };
        const borderClass = typeColors[entry.type] || 'border-l-neutral';

        return `
            <div class="p-3 bg-base-300/30 rounded border-l-2 ${borderClass}">
                <div class="text-xs text-neutral-content/50 mb-1">${time}</div>
                <div class="text-xs font-mono break-all">${formattedSql}</div>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <div class="bg-base-200 border border-neutral rounded-lg flex flex-col min-h-0 flex-[0.6]">
            <div class="px-4 py-3 border-b border-neutral flex justify-between items-center bg-base-300/50">
                <h3 class="font-mono text-sm font-semibold text-neutral-content">Query Log</h3>
                <button class="btn btn-xs btn-ghost text-neutral-content/60" onclick="clearQueryLog()">Clear</button>
            </div>
            <div class="overflow-auto flex-1 p-3 space-y-2">
                ${entries.length ? entries : '<div class="text-center text-neutral-content/50 text-sm py-4">Queries will appear here</div>'}
            </div>
        </div>
    `;
}

// ERD rendering
function renderErd(tables) {
    const erdContent = document.getElementById('erdContent');
    if (!erdContent) return;

    // Keep as array (don't join yet)
    const tableCards = tables.map((table, index) => {
        const columns = table.columns.map(col => `
            <div class="flex items-center gap-3 px-4 py-2 border-b border-neutral last:border-b-0">
                ${col.key === 'pk' ? '<span class="erd-pk">PK</span>' :
                  col.key === 'fk' ? '<span class="erd-fk">FK</span>' :
                  '<span class="w-6"></span>'}
                <span class="font-mono text-sm flex-1">${col.name}</span>
                <span class="font-mono text-xs text-neutral-content/60">${col.type}</span>
            </div>
        `).join('');

        return `
            <div class="bg-base-300 border border-neutral rounded-lg min-w-56 overflow-hidden">
                <div class="bg-neutral px-4 py-3 text-center font-mono font-semibold">${table.name}</div>
                <div>${columns}</div>
            </div>
        `;
    }); // Removed .join('') to keep as array

    // Connection line between tables
    const connection = `
        <div class="flex flex-col items-center gap-2 px-4">
            <div class="w-20 h-0.5 bg-neutral-content/30 relative">
                <div class="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1 w-2 h-2 border-l-2 border-b-2 border-neutral-content/30 rotate-45"></div>
                <div class="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1 w-2 h-2 border-r-2 border-t-2 border-neutral-content/30 rotate-45"></div>
            </div>
            <div class="flex items-center gap-2 text-sm">
                <span class="font-mono font-bold text-neutral-content">1</span>
                <span class="text-neutral-content/60 italic">has many</span>
                <span class="font-mono font-bold text-neutral-content">N</span>
            </div>
        </div>
    `;

    erdContent.innerHTML = `
        <div class="flex items-center justify-center gap-4 flex-wrap mb-8">
            ${tableCards[0] || ''}
            ${connection}
            ${tableCards[1] || ''}
        </div>
        <div class="bg-base-300 border border-neutral rounded-lg p-4">
            <h4 class="font-semibold mb-3 text-sm">Legend</h4>
            <div class="space-y-2 text-sm">
                <div class="flex items-center gap-3">
                    <span class="erd-pk">PK</span>
                    <span class="text-neutral-content">Primary Key - Unique identifier for each row</span>
                </div>
                <div class="flex items-center gap-3">
                    <span class="erd-fk">FK</span>
                    <span class="text-neutral-content">Foreign Key - References another table's primary key</span>
                </div>
                <div class="flex items-center gap-3">
                    <span class="font-mono font-bold">1 : N</span>
                    <span class="text-neutral-content">One-to-Many relationship</span>
                </div>
            </div>
        </div>
    `;
}

// Open ERD modal
function openErdModal() {
    document.getElementById('erdModal').showModal();
}

// ==================== TIME UTILITIES ====================

function formatDuration(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function formatDurationShort(seconds) {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hrs}h ${mins}m`;
}

// ==================== DATE UTILITIES ====================

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatDateTime(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleString();
}

function isSameDay(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
}

// ==================== CATEGORY ICONS ====================

const categoryIcons = {
    development: '💻',
    design: '🎨',
    meeting: '📅',
    research: '🔍',
    writing: '✍️',
    admin: '📋',
    learning: '📚',
    other: '📦',
    health: '💪',
    mindfulness: '🧘',
    productivity: '⚡',
    social: '👥',
    finance: '💰',
    creative: '🎭'
};

// ==================== CODE EXPLANATION SYSTEM ====================

// Code explanations for Time Tracker buttons
const timeTrackerExplanations = {
    'startTimer': {
        title: 'Start Timer Button',
        summary: 'Begins tracking time for a task by creating a new work session in the database.',
        steps: [
            {
                label: 'Stop Any Active Session',
                description: 'First, we check if there\'s already a timer running. If so, we stop it to ensure only one task is tracked at a time.',
                code: `const activeSession = this.getAnyActiveSession();
if (activeSession) {
    this.endSession(activeSession.id);
}`
            },
            {
                label: 'Create New Session (INSERT)',
                description: 'We insert a new row into the work_sessions table. This creates a record with the task_id and the current timestamp as started_at.',
                code: `const session = {
    id: this.nextSessionId++,
    task_id: taskId,
    started_at: new Date().toISOString(),
    ended_at: null,
    duration: null
};
this.sessions.push(session);`,
                sql: `INSERT INTO work_sessions (task_id, started_at)
VALUES (1, '2024-01-15T10:30:00');`
            },
            {
                label: 'Start UI Timer',
                description: 'We kick off a JavaScript interval that updates the display every second, so you can see the time counting up.',
                code: `this.timerInterval = setInterval(() => {
    this.updateTimerDisplay();
}, 1000);`
            }
        ],
        concepts: ['INSERT statement', 'Foreign Key (task_id)', 'Timestamps', 'NULL values']
    },
    'stopTimer': {
        title: 'Stop Timer Button',
        summary: 'Stops the active timer and calculates the duration of the work session.',
        steps: [
            {
                label: 'Find Active Session',
                description: 'We look for a session that has started_at but no ended_at (NULL). This is our "running" session.',
                code: `const activeSession = this.sessions.find(
    s => s.task_id === taskId && !s.ended_at
);`
            },
            {
                label: 'Calculate Duration',
                description: 'We calculate how many seconds have passed between when we started and right now.',
                code: `const endTime = new Date();
const startTime = new Date(session.started_at);
const durationSeconds = Math.floor(
    (endTime - startTime) / 1000
);`
            },
            {
                label: 'Update Session (UPDATE)',
                description: 'We update the session record with the end time and calculated duration.',
                code: `session.ended_at = endTime.toISOString();
session.duration = durationSeconds;`,
                sql: `UPDATE work_sessions
SET ended_at = '2024-01-15T11:45:00',
    duration = 4500
WHERE id = 1;`
            },
            {
                label: 'Compute Total Time (SELECT SUM)',
                description: 'After stopping, we recalculate the task\'s total time by summing all session durations. This is a normalized approach—total_time isn\'t stored, it\'s computed!',
                sql: `SELECT SUM(duration) as total_time
FROM work_sessions
WHERE task_id = 1;`
            }
        ],
        concepts: ['UPDATE statement', 'NULL → value transition', 'SUM aggregation', 'Normalization']
    },
    'addTask': {
        title: 'Add Task Button',
        summary: 'Creates a new task in the database when you submit the form.',
        steps: [
            {
                label: 'Get Form Data',
                description: 'We read the task name and category from the form inputs.',
                code: `const name = form.taskName.value.trim();
const category = form.category.value;`
            },
            {
                label: 'Generate Primary Key',
                description: 'Each task needs a unique ID. We use an auto-incrementing counter to ensure uniqueness.',
                code: `const id = this.nextTaskId++;`
            },
            {
                label: 'Insert Task (INSERT)',
                description: 'We create a new row in the tasks table with all the initial values.',
                code: `const newTask = {
    id,
    name: task.name,
    category: task.category,
    status: 'active',
    created_at: new Date().toISOString(),
    completed_at: null
};
this.tasks.push(newTask);`,
                sql: `INSERT INTO tasks
    (name, category, status, created_at)
VALUES
    ('Design homepage', 'design', 'active', '2024-01-15');`
            }
        ],
        concepts: ['Primary Key (id)', 'AUTO_INCREMENT', 'INSERT statement', 'Default values']
    },
    'completeTask': {
        title: 'Complete Task Button (✓)',
        summary: 'Marks a task as completed by updating its status in the database.',
        steps: [
            {
                label: 'Stop Active Timer (if running)',
                description: 'If this task has an active timer, we stop it first to record the final session.',
                code: `const activeSession = this.getActiveSession(taskId);
if (activeSession) {
    this.endSession(activeSession.id);
}`
            },
            {
                label: 'Update Task Status (UPDATE)',
                description: 'We change the status from "active" to "completed" and record when it was completed.',
                code: `task.status = 'completed';
task.completed_at = new Date().toISOString();`,
                sql: `UPDATE tasks
SET status = 'completed',
    completed_at = '2024-01-15T14:30:00'
WHERE id = 1;`
            }
        ],
        concepts: ['UPDATE statement', 'Status fields', 'Timestamp recording']
    },
    'reopenTask': {
        title: 'Reopen Task Button (↩)',
        summary: 'Changes a completed task back to active status.',
        steps: [
            {
                label: 'Update Task Status (UPDATE)',
                description: 'We set status back to "active" and clear the completed_at timestamp (set it to NULL).',
                code: `task.status = 'active';
task.completed_at = null;`,
                sql: `UPDATE tasks
SET status = 'active',
    completed_at = NULL
WHERE id = 1;`
            }
        ],
        concepts: ['UPDATE statement', 'Setting NULL', 'Status transitions']
    },
    'deleteTask': {
        title: 'Delete Task Button (🗑)',
        summary: 'Removes a task and all its related work sessions from the database.',
        steps: [
            {
                label: 'Delete Related Sessions First (DELETE)',
                description: 'Because sessions have a foreign key pointing to tasks, we must delete the "child" records first. This maintains referential integrity.',
                code: `this.sessions = this.sessions.filter(
    s => s.task_id !== taskId
);`,
                sql: `DELETE FROM work_sessions
WHERE task_id = 1;
-- Removes all sessions for this task`
            },
            {
                label: 'Delete Task (DELETE)',
                description: 'Now that there are no dependent records, we can safely delete the task itself.',
                code: `this.tasks.splice(taskIndex, 1);`,
                sql: `DELETE FROM tasks WHERE id = 1;`
            }
        ],
        concepts: ['DELETE statement', 'Referential integrity', 'Cascade delete pattern', 'Foreign key constraints']
    },
    'viewSessions': {
        title: 'View Sessions Button (📊)',
        summary: 'Opens a modal showing all work sessions for a task with computed totals.',
        steps: [
            {
                label: 'Filter Sessions (SELECT WHERE)',
                description: 'We query for all sessions that belong to this specific task using the foreign key.',
                code: `const sessions = this.sessions.filter(
    s => s.task_id === taskId
);`,
                sql: `SELECT * FROM work_sessions
WHERE task_id = 1;`
            },
            {
                label: 'Compute Total (SELECT SUM)',
                description: 'We calculate the total time by summing up all durations. This demonstrates why we don\'t need to store total_time—we can always compute it!',
                code: `const totalTime = this.sessions
    .filter(s => s.task_id === taskId && s.duration !== null)
    .reduce((sum, s) => sum + s.duration, 0);`,
                sql: `SELECT SUM(duration) as total_time
FROM work_sessions
WHERE task_id = 1
  AND duration IS NOT NULL;`
            }
        ],
        concepts: ['SELECT with WHERE', 'SUM aggregation', 'Filtering NULL values', 'Computed vs stored values']
    }
};

// Code explanations for Habit Tracker buttons
const habitTrackerExplanations = {
    'toggleCompletion': {
        title: 'Habit Checkbox',
        summary: 'Toggles whether a habit is completed for today by inserting or deleting a completion record.',
        steps: [
            {
                label: 'Check Current Status',
                description: 'First, we check if there\'s already a completion record for this habit on this date.',
                code: `const isCompleted = this.completions.some(c =>
    c.habit_id === habitId &&
    isSameDay(c.completed_at, this.currentDate)
);`
            },
            {
                label: 'If NOT completed → INSERT',
                description: 'Clicking an unchecked habit creates a new completion record.',
                code: `const completion = {
    id: this.nextCompletionId++,
    habit_id: habitId,
    completed_at: this.currentDate.toISOString()
};
this.completions.push(completion);`,
                sql: `INSERT INTO completions (habit_id, completed_at)
VALUES (1, '2024-01-15');`
            },
            {
                label: 'If completed → DELETE',
                description: 'Clicking a checked habit removes the completion record.',
                code: `this.completions = this.completions.filter(
    c => c.id !== completion.id
);`,
                sql: `DELETE FROM completions
WHERE habit_id = 1
  AND DATE(completed_at) = '2024-01-15';`
            }
        ],
        concepts: ['INSERT statement', 'DELETE statement', 'Composite lookup (habit_id + date)', 'Toggle pattern']
    },
    'addHabit': {
        title: 'Add Habit Button',
        summary: 'Creates a new habit in the database with its frequency settings.',
        steps: [
            {
                label: 'Collect Form Data',
                description: 'We gather the habit name, category, and frequency configuration from the form.',
                code: `const name = form.habitName.value.trim();
const category = form.category.value;
const frequencyType = form.frequencyType.value;
// frequencyValue varies: null, number, or array of days`
            },
            {
                label: 'Insert Habit (INSERT)',
                description: 'We create a new row in the habits table. Note how frequency_value can store different types of data (JSON flexibility).',
                code: `const newHabit = {
    id: this.nextHabitId++,
    name: habit.name,
    category: habit.category,
    frequency_type: habit.frequency_type,
    frequency_value: habit.frequency_value,
    created_at: new Date().toISOString()
};`,
                sql: `INSERT INTO habits
    (name, category, frequency_type, frequency_value, created_at)
VALUES
    ('Exercise', 'health', 'times_per_week', 4, '2024-01-15');`
            }
        ],
        concepts: ['INSERT statement', 'JSON data type', 'Flexible schema design', 'Frequency modeling']
    },
    'deleteHabit': {
        title: 'Delete Habit Button (🗑)',
        summary: 'Removes a habit and all its completion records from the database.',
        steps: [
            {
                label: 'Delete Completions First (DELETE)',
                description: 'We delete all completion records for this habit first (referential integrity).',
                code: `this.completions = this.completions.filter(
    c => c.habit_id !== habitId
);`,
                sql: `DELETE FROM completions
WHERE habit_id = 1;
-- May delete many rows!`
            },
            {
                label: 'Delete Habit (DELETE)',
                description: 'Now we can safely delete the habit itself.',
                code: `this.habits.splice(habitIndex, 1);`,
                sql: `DELETE FROM habits WHERE id = 1;`
            }
        ],
        concepts: ['DELETE statement', 'Cascade delete pattern', 'Referential integrity']
    },
    'expandHabit': {
        title: 'Expand/Collapse Button (▼/▲)',
        summary: 'Toggles the calendar view for a habit—no database operations here!',
        steps: [
            {
                label: 'Toggle UI State',
                description: 'This is purely a UI operation. We just track which habit is expanded.',
                code: `this.expandedHabitId =
    this.expandedHabitId === habitId ? null : habitId;
this.render();`
            },
            {
                label: 'Render Calendar (SELECT)',
                description: 'When expanded, we query completions to show the 4-week history.',
                code: `const isCompleted = this.isCompletedOnDate(habit.id, date);`,
                sql: `-- For each day in the calendar:
SELECT EXISTS(
    SELECT 1 FROM completions
    WHERE habit_id = 1
      AND DATE(completed_at) = '2024-01-10'
);`
            }
        ],
        concepts: ['UI state management', 'Query per display element', 'EXISTS check']
    },
    'navigateDate': {
        title: 'Date Navigation Arrows (← →)',
        summary: 'Changes the current viewing date—affects which habits show and their completion status.',
        steps: [
            {
                label: 'Update Current Date',
                description: 'We simply move the date forward or backward by one day.',
                code: `this.currentDate.setDate(
    this.currentDate.getDate() + delta
);`
            },
            {
                label: 'Re-query Habits',
                description: 'The render function then re-filters habits based on the new date.',
                code: `const habits = this.getHabitsForDate(this.currentDate)
    .filter(h => this.shouldShowHabitOnDate(h, this.currentDate));`,
                sql: `-- Conceptually:
SELECT * FROM habits
WHERE created_at <= '2024-01-15'
  AND (frequency_type = 'daily'
       OR /* matches day of week */);`
            }
        ],
        concepts: ['Date filtering', 'Dynamic queries', 'Frequency-based filtering']
    }
};

// Get explanation for a button action
function getCodeExplanation(action, tool) {
    const explanations = tool === 'time-tracker' ? timeTrackerExplanations : habitTrackerExplanations;
    return explanations[action] || null;
}

// Render explanation modal content
function renderCodeExplanation(explanation) {
    if (!explanation) return '<p class="text-neutral-content">No explanation available for this action.</p>';

    const stepsHtml = explanation.steps.map((step, index) => `
        <div class="bg-base-300 rounded-lg p-4 space-y-3">
            <div class="flex items-start gap-3">
                <div class="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-primary-content text-sm font-bold flex-shrink-0">
                    ${index + 1}
                </div>
                <div class="flex-1">
                    <h4 class="font-semibold text-base-content">${step.label}</h4>
                    <p class="text-sm text-neutral-content mt-1">${step.description}</p>
                </div>
            </div>
            ${step.code ? `
                <div class="ml-9">
                    <div class="text-xs text-neutral-content/60 uppercase tracking-wider mb-1">JavaScript</div>
                    <pre class="code-block text-xs overflow-x-auto p-3 bg-base-100 rounded border border-neutral"><code>${escapeHtml(step.code)}</code></pre>
                </div>
            ` : ''}
            ${step.sql ? `
                <div class="ml-9">
                    <div class="text-xs text-info uppercase tracking-wider mb-1">SQL Equivalent</div>
                    <pre class="code-block text-xs overflow-x-auto p-3 bg-info/5 rounded border border-info/30"><code>${formatSqlForExplanation(step.sql)}</code></pre>
                </div>
            ` : ''}
        </div>
    `).join('');

    const conceptsHtml = explanation.concepts.map(concept =>
        `<span class="badge badge-neutral text-xs">${concept}</span>`
    ).join('');

    return `
        <div class="space-y-4">
            <!-- Summary -->
            <div class="bg-success/10 border border-success/30 rounded-lg p-4">
                <p class="text-sm">${explanation.summary}</p>
            </div>

            <!-- Steps -->
            <div class="space-y-3">
                <h4 class="text-sm font-semibold text-neutral-content uppercase tracking-wider">Step by Step</h4>
                ${stepsHtml}
            </div>

            <!-- Concepts -->
            <div class="pt-2">
                <h4 class="text-sm font-semibold text-neutral-content uppercase tracking-wider mb-2">Database Concepts</h4>
                <div class="flex flex-wrap gap-2">
                    ${conceptsHtml}
                </div>
            </div>
        </div>
    `;
}

// Helper to escape HTML in code blocks
function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Format SQL with syntax highlighting for explanation modal
function formatSqlForExplanation(sql) {
    const keywords = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'FROM', 'WHERE', 'INTO', 'VALUES', 'SET', 'AND', 'OR', 'ORDER BY', 'GROUP BY', 'LIKE', 'IN', 'NULL', 'SUM', 'COUNT', 'AVG', 'MIN', 'MAX', 'AS', 'JOIN', 'LEFT JOIN', 'ON', 'EXISTS', 'DATE', 'IS NOT NULL', 'IS NULL'];

    let formatted = escapeHtml(sql);

    keywords.forEach(kw => {
        const regex = new RegExp(`\\b${kw}\\b`, 'gi');
        formatted = formatted.replace(regex, `<span class="sql-keyword">${kw}</span>`);
    });

    // Highlight comments
    formatted = formatted.replace(/(--.*)/g, '<span class="text-neutral-content/50 italic">$1</span>');

    return formatted;
}

// Show code explanation modal
function showCodeExplanation(action, tool) {
    const explanation = getCodeExplanation(action, tool);
    const modal = document.getElementById('codeExplainModal');
    const titleEl = document.getElementById('codeExplainTitle');
    const contentEl = document.getElementById('codeExplainContent');

    if (explanation) {
        titleEl.textContent = explanation.title;
        contentEl.innerHTML = renderCodeExplanation(explanation);
    } else {
        titleEl.textContent = 'Code Explanation';
        contentEl.innerHTML = '<p class="text-neutral-content text-center py-8">No detailed explanation available for this action yet.</p>';
    }

    modal.showModal();
}

// ==================== ALT+CLICK INTERCEPTION ====================

// Initialize Alt+Click listener
function initCodeExplainListener() {
    document.addEventListener('click', (e) => {
        // Only intercept if Alt/Option is held
        if (!e.altKey) return;

        // Find the closest button or clickable element
        const button = e.target.closest('button, [onclick]');
        if (!button) return;

        // Prevent the normal action
        e.preventDefault();
        e.stopPropagation();

        // Determine which action this button performs
        const action = detectButtonAction(button);
        const tool = typeof currentTool !== 'undefined' ? currentTool : 'time-tracker';

        if (action) {
            showCodeExplanation(action, tool);
        }
    }, true); // Use capture phase to intercept before handlers
}

// Detect what action a button performs based on its attributes
function detectButtonAction(button) {
    const onclick = button.getAttribute('onclick') || '';
    const text = button.textContent?.trim() || '';
    const title = button.getAttribute('title') || '';

    // Time Tracker actions
    if (onclick.includes('startTimer')) return 'startTimer';
    if (onclick.includes('stopTimer')) return 'stopTimer';
    if (onclick.includes('completeTaskAction')) return 'completeTask';
    if (onclick.includes('reopenTaskAction')) return 'reopenTask';
    if (onclick.includes('deleteTaskAction')) return 'deleteTask';
    if (onclick.includes('openSessionsModal')) return 'viewSessions';

    // Habit Tracker actions
    if (onclick.includes('toggleCompletionAction')) return 'toggleCompletion';
    if (onclick.includes('deleteHabitAction')) return 'deleteHabit';
    if (onclick.includes('toggleExpand')) return 'expandHabit';
    if (onclick.includes('navigateDate')) return 'navigateDate';
    if (onclick.includes('goToToday')) return 'navigateDate';

    // Form submit buttons
    if (button.type === 'submit') {
        const form = button.closest('form');
        if (form?.id === 'ttAddTaskForm') return 'addTask';
        if (form?.id === 'htAddHabitForm') return 'addHabit';
    }

    // Text/icon based detection
    if (text === '▶' || text.includes('Start')) return 'startTimer';
    if (text === '⏹' || text === 'Stop') return 'stopTimer';
    if (text === '✓') return 'completeTask';
    if (text === '↩') return 'reopenTask';
    if (text === '🗑') return button.closest('[data-habit-id]') ? 'deleteHabit' : 'deleteTask';
    if (text === '📊' || title.includes('session')) return 'viewSessions';
    if (text === '▼' || text === '▲') return 'expandHabit';
    if (text === '←' || text === '→') return 'navigateDate';

    return null;
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCodeExplainListener);
} else {
    initCodeExplainListener();
}
