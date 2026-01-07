// ==================== DATABASE SIMULATION ====================

const STORAGE_KEY = 'habitTrackerDB';

class Database {
    constructor() {
        this.habits = [];
        this.completions = [];
        this.nextHabitId = 1;
        this.nextCompletionId = 1;
        this.queryLog = [];
        this.load();
    }

    // Save to localStorage
    save() {
        const data = {
            habits: this.habits,
            completions: this.completions,
            nextHabitId: this.nextHabitId,
            nextCompletionId: this.nextCompletionId
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    // Load from localStorage
    load() {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                const data = JSON.parse(stored);
                this.habits = data.habits || [];
                this.completions = data.completions || [];
                this.nextHabitId = data.nextHabitId || 1;
                this.nextCompletionId = data.nextCompletionId || 1;
            } catch (e) {
                console.error('Failed to load data:', e);
            }
        }
    }

    // Clear all data
    clearAll() {
        this.habits = [];
        this.completions = [];
        this.nextHabitId = 1;
        this.nextCompletionId = 1;
        this.queryLog = [];
        localStorage.removeItem(STORAGE_KEY);
    }

    // Generate a new habit ID
    getNextHabitId() {
        return this.nextHabitId++;
    }

    // Generate a new completion ID
    getNextCompletionId() {
        return this.nextCompletionId++;
    }

    // Insert a habit
    insertHabit(habit) {
        const id = this.getNextHabitId();
        const newHabit = {
            id,
            name: habit.name,
            icon: habit.icon,
            frequency_type: habit.frequencyType,
            frequency_days: habit.frequencyDays,
            target_count: habit.targetCount,
            created_at: new Date().toISOString(),
            is_active: true
        };
        this.habits.push(newHabit);

        const sql = `INSERT INTO habits (name, icon, frequency_type, frequency_days, target_count, created_at, is_active)
VALUES ('${newHabit.name}', '${newHabit.icon}', '${newHabit.frequency_type}', ${newHabit.frequency_days ? `'${newHabit.frequency_days}'` : 'NULL'}, ${newHabit.target_count || 'NULL'}, '${newHabit.created_at}', ${newHabit.is_active});`;

        this.logQuery('insert', sql);
        this.save();
        return { ...newHabit, _animation: 'insert' };
    }

    // Insert a completion for a specific date
    insertCompletion(habitId, date, notes = null) {
        const id = this.getNextCompletionId();
        const completedAt = date instanceof Date ? date.toISOString() : new Date().toISOString();
        const completion = {
            id,
            habit_id: habitId,
            completed_at: completedAt,
            notes
        };
        this.completions.push(completion);

        const sql = `INSERT INTO completions (habit_id, completed_at, notes)
VALUES (${habitId}, '${completion.completed_at}', ${notes ? `'${notes}'` : 'NULL'});`;

        this.logQuery('insert', sql);
        this.save();
        return { ...completion, _animation: 'insert' };
    }

    // Delete a completion (uncomplete a habit)
    deleteCompletion(habitId, date) {
        const dateStr = date.toISOString().split('T')[0];
        const index = this.completions.findIndex(c =>
            c.habit_id === habitId &&
            c.completed_at.split('T')[0] === dateStr
        );

        if (index !== -1) {
            const completion = this.completions[index];
            this.completions.splice(index, 1);

            const sql = `DELETE FROM completions
WHERE habit_id = ${habitId} AND DATE(completed_at) = '${dateStr}';`;

            this.logQuery('delete', sql);
            this.save();
            return { ...completion, _animation: 'delete' };
        }
        return null;
    }

    // Update a habit's active status
    updateHabitStatus(habitId, isActive) {
        const habit = this.habits.find(h => h.id === habitId);
        if (habit) {
            habit.is_active = isActive;

            const sql = `UPDATE habits
SET is_active = ${isActive}
WHERE id = ${habitId};`;

            this.logQuery('update', sql);
            this.save();
            return { ...habit, _animation: 'update' };
        }
        return null;
    }

    // Delete a habit (and its completions)
    deleteHabit(habitId) {
        const habitIndex = this.habits.findIndex(h => h.id === habitId);
        if (habitIndex !== -1) {
            const habit = this.habits[habitIndex];

            // First delete completions
            const completionsToDelete = this.completions.filter(c => c.habit_id === habitId);
            this.completions = this.completions.filter(c => c.habit_id !== habitId);

            if (completionsToDelete.length > 0) {
                const sql1 = `DELETE FROM completions
WHERE habit_id = ${habitId};
-- (${completionsToDelete.length} row(s) affected)`;
                this.logQuery('delete', sql1);
            }

            // Then delete habit
            this.habits.splice(habitIndex, 1);
            const sql2 = `DELETE FROM habits
WHERE id = ${habitId};`;
            this.logQuery('delete', sql2);
            this.save();

            return {
                habit: { ...habit, _animation: 'delete' },
                deletedCompletions: completionsToDelete.map(c => ({ ...c, _animation: 'delete' }))
            };
        }
        return null;
    }

    // Get all active habits
    getActiveHabits() {
        const sql = `SELECT * FROM habits
WHERE is_active = true
ORDER BY created_at DESC;`;
        this.logQuery('select', sql);
        return this.habits.filter(h => h.is_active);
    }

    // Get habits for a specific date
    getHabitsForDate(date) {
        const dayOfWeek = date.getDay();
        const dateStr = date.toISOString().split('T')[0];

        const sql = `SELECT h.*,
       (SELECT COUNT(*) FROM completions c
        WHERE c.habit_id = h.id
        AND DATE(c.completed_at) = '${dateStr}') as completed_on_date
FROM habits h
WHERE h.is_active = true
  AND DATE(h.created_at) <= '${dateStr}'
  AND (h.frequency_type = 'daily'
       OR (h.frequency_type = 'specific_days' AND h.frequency_days LIKE '%${dayOfWeek}%')
       OR h.frequency_type IN ('times_per_week', 'times_per_month', 'times_per_year'));`;
        this.logQuery('select', sql);

        return this.habits.filter(h => {
            if (!h.is_active) return false;
            // Don't show habits created after this date
            if (new Date(h.created_at).toISOString().split('T')[0] > dateStr) return false;

            switch (h.frequency_type) {
                case 'daily':
                    return true;
                case 'specific_days':
                    return h.frequency_days && h.frequency_days.includes(dayOfWeek.toString());
                case 'times_per_week':
                case 'times_per_month':
                case 'times_per_year':
                    return true;
                default:
                    return false;
            }
        });
    }

    // Check if habit is completed on a specific date
    isCompletedOnDate(habitId, date) {
        const dateStr = date.toISOString().split('T')[0];
        return this.completions.some(c =>
            c.habit_id === habitId &&
            c.completed_at.split('T')[0] === dateStr
        );
    }

    // Check if a date is applicable for a habit (should the habit have been done?)
    isDateApplicable(habit, date) {
        const createdDate = new Date(habit.created_at).toISOString().split('T')[0];
        const checkDate = date.toISOString().split('T')[0];

        // Habit didn't exist yet
        if (checkDate < createdDate) return false;

        const dayOfWeek = date.getDay();

        switch (habit.frequency_type) {
            case 'daily':
                return true;
            case 'specific_days':
                return habit.frequency_days && habit.frequency_days.includes(dayOfWeek.toString());
            case 'times_per_week':
            case 'times_per_month':
            case 'times_per_year':
                // For flexible schedules, every day is "applicable"
                return true;
            default:
                return false;
        }
    }

    // Calculate streak for a habit
    calculateStreak(habitId) {
        const habit = this.habits.find(h => h.id === habitId);
        if (!habit) return 0;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let streak = 0;
        let currentDate = new Date(today);

        // For times_per_week/month/year, calculate differently
        if (['times_per_week', 'times_per_month', 'times_per_year'].includes(habit.frequency_type)) {
            // Count consecutive periods where target was met
            // For simplicity, just return current period progress
            const stats = this.getHabitStats(habitId, today);
            return stats ? stats.completed : 0;
        }

        // For daily and specific_days habits
        while (true) {
            const isApplicable = this.isDateApplicable(habit, currentDate);

            if (isApplicable) {
                const isCompleted = this.isCompletedOnDate(habitId, currentDate);
                const isToday = currentDate.toISOString().split('T')[0] === today.toISOString().split('T')[0];

                if (isCompleted) {
                    streak++;
                } else if (!isToday) {
                    // Missed a day (not today), streak broken
                    break;
                }
                // If it's today and not completed, don't break streak yet
            }

            // Move to previous day
            currentDate.setDate(currentDate.getDate() - 1);

            // Don't go before habit was created
            const createdDate = new Date(habit.created_at);
            createdDate.setHours(0, 0, 0, 0);
            if (currentDate < createdDate) break;

            // Safety limit
            if (streak > 365) break;
        }

        return streak;
    }

    // Get completion stats for a habit in a period
    getHabitStats(habitId, referenceDate) {
        const habit = this.habits.find(h => h.id === habitId);
        if (!habit) return null;

        const now = referenceDate || new Date();
        let startDate;

        switch (habit.frequency_type) {
            case 'times_per_week':
                startDate = new Date(now);
                startDate.setDate(now.getDate() - now.getDay());
                startDate.setHours(0, 0, 0, 0);
                break;
            case 'times_per_month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                break;
            case 'times_per_year':
                startDate = new Date(now.getFullYear(), 0, 1);
                break;
            default:
                return null;
        }

        const completions = this.completions.filter(c =>
            c.habit_id === habitId &&
            new Date(c.completed_at) >= startDate &&
            new Date(c.completed_at) <= now
        );

        return {
            completed: completions.length,
            target: habit.target_count
        };
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
let selectedDate = new Date();
let calendarViewDate = new Date();
let expandedHabits = new Set();
let habitDetailMonths = {}; // Track which month each habit detail is viewing

// ==================== DATE UTILITIES ====================

function formatDateDisplay(date) {
    const options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

function isSameDay(date1, date2) {
    return date1.toISOString().split('T')[0] === date2.toISOString().split('T')[0];
}

function isToday(date) {
    return isSameDay(date, new Date());
}

function isFuture(date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);
    return checkDate > today;
}

// ==================== UI RENDERING ====================

function formatFrequency(habit) {
    switch (habit.frequency_type) {
        case 'daily':
            return 'Every day';
        case 'specific_days':
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const selectedDays = habit.frequency_days.split(',').map(d => days[parseInt(d)]);
            return selectedDays.join(', ');
        case 'times_per_week':
            return `${habit.target_count}x per week`;
        case 'times_per_month':
            return `${habit.target_count}x per month`;
        case 'times_per_year':
            return `${habit.target_count}x per year`;
        default:
            return '';
    }
}

function updateDateDisplay() {
    const display = document.getElementById('currentDateDisplay');
    const heading = document.getElementById('habitsHeading');

    display.textContent = formatDateDisplay(selectedDate);
    heading.textContent = isToday(selectedDate) ? "Today's Habits" : "Habits for this Day";
}

function renderCalendarWidget() {
    const monthDisplay = document.getElementById('calendarMonth');
    const daysContainer = document.getElementById('calendarDays');

    const year = calendarViewDate.getFullYear();
    const month = calendarViewDate.getMonth();

    monthDisplay.textContent = calendarViewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPadding = firstDay.getDay();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let html = '';

    // Previous month padding
    const prevMonth = new Date(year, month, 0);
    for (let i = startPadding - 1; i >= 0; i--) {
        const day = prevMonth.getDate() - i;
        const date = new Date(year, month - 1, day);
        html += `<div class="calendar-day other-month" data-date="${date.toISOString()}">${day}</div>`;
    }

    // Current month days
    for (let day = 1; day <= lastDay.getDate(); day++) {
        const date = new Date(year, month, day);
        date.setHours(0, 0, 0, 0);

        let classes = 'calendar-day';
        if (isSameDay(date, today)) classes += ' today';
        if (isSameDay(date, selectedDate)) classes += ' selected';
        if (isFuture(date)) classes += ' future';

        html += `<div class="${classes}" data-date="${date.toISOString()}">${day}</div>`;
    }

    // Next month padding
    const remainingCells = 42 - (startPadding + lastDay.getDate());
    for (let day = 1; day <= remainingCells; day++) {
        const date = new Date(year, month + 1, day);
        html += `<div class="calendar-day other-month" data-date="${date.toISOString()}">${day}</div>`;
    }

    daysContainer.innerHTML = html;

    // Add click handlers
    daysContainer.querySelectorAll('.calendar-day:not(.future)').forEach(dayEl => {
        dayEl.addEventListener('click', () => {
            const date = new Date(dayEl.dataset.date);
            if (!isFuture(date)) {
                selectedDate = date;
                renderCalendarWidget();
                updateDateDisplay();
                renderTodayHabits();
            }
        });
    });
}

function renderHabitDetailCalendar(habitId) {
    const habit = db.habits.find(h => h.id === habitId);
    if (!habit) return '';

    const viewDate = habitDetailMonths[habitId] || new Date();
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPadding = firstDay.getDay();

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let daysHtml = '';

    // Day headers
    const dayHeaders = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    daysHtml += dayHeaders.map(d => `<div class="habit-calendar-header">${d}</div>`).join('');

    // Previous month padding
    const prevMonth = new Date(year, month, 0);
    for (let i = startPadding - 1; i >= 0; i--) {
        daysHtml += `<div class="habit-calendar-day not-applicable"></div>`;
    }

    // Current month days
    for (let day = 1; day <= lastDay.getDate(); day++) {
        const date = new Date(year, month, day);
        date.setHours(0, 0, 0, 0);

        const isApplicable = db.isDateApplicable(habit, date);
        const isCompleted = db.isCompletedOnDate(habitId, date);
        const isTodayDate = isSameDay(date, today);
        const isFutureDate = isFuture(date);

        let classes = 'habit-calendar-day';

        if (isFutureDate) {
            classes += ' future';
        } else if (!isApplicable) {
            classes += ' not-applicable';
        } else if (isCompleted) {
            classes += ' completed';
        } else if (!isTodayDate) {
            // Missed - applicable but not completed and not today
            classes += ' missed';
        }

        if (isTodayDate) {
            classes += ' today-marker';
        }

        daysHtml += `<div class="${classes}">${day}</div>`;
    }

    const monthName = viewDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    return `
        <div class="habit-detail-calendar">
            <div class="habit-detail-header">
                <span class="habit-detail-month">${monthName}</span>
                <div class="habit-detail-nav">
                    <button onclick="changeHabitDetailMonth(${habitId}, -1)">&lt;</button>
                    <button onclick="changeHabitDetailMonth(${habitId}, 1)">&gt;</button>
                </div>
            </div>
            <div class="habit-calendar-grid">
                ${daysHtml}
            </div>
        </div>
    `;
}

function renderTodayHabits() {
    const container = document.getElementById('todayHabits');
    const habits = db.getHabitsForDate(selectedDate);

    if (habits.length === 0) {
        container.innerHTML = '<div class="empty-state">No habits for this day. Add some habits to get started!</div>';
        return;
    }

    container.innerHTML = habits.map(habit => {
        const isCompleted = db.isCompletedOnDate(habit.id, selectedDate);
        const streak = db.calculateStreak(habit.id);
        const stats = db.getHabitStats(habit.id, selectedDate);
        const isExpanded = expandedHabits.has(habit.id);

        let progressText = formatFrequency(habit);
        if (stats) {
            progressText = `${stats.completed}/${stats.target} this ${habit.frequency_type.replace('times_per_', '')}`;
        }

        const streakClass = streak > 0 ? 'habit-streak' : 'habit-streak habit-streak-zero';
        const streakText = streak > 0 ? `🔥 ${streak}` : `🔥 0`;

        return `
            <div class="habit-item-wrapper ${isCompleted ? 'completed' : ''}" data-habit-id="${habit.id}">
                <div class="habit-main-row">
                    <button class="habit-expand-btn ${isExpanded ? 'expanded' : ''}"
                            onclick="event.stopPropagation(); toggleHabitExpand(${habit.id})">▼</button>
                    <div class="habit-icon">${habit.icon}</div>
                    <div class="habit-info" onclick="toggleHabitCompletion(${habit.id})">
                        <div class="habit-name">${habit.name}</div>
                        <div class="habit-frequency">${progressText}</div>
                    </div>
                    <span class="${streakClass}">${streakText}</span>
                    <div class="habit-check" onclick="toggleHabitCompletion(${habit.id})">
                        ${isCompleted ? '✓' : ''}
                    </div>
                </div>
                <div class="habit-detail ${isExpanded ? 'expanded' : ''}" id="habit-detail-${habit.id}">
                    ${isExpanded ? renderHabitDetailCalendar(habit.id) : ''}
                </div>
            </div>
        `;
    }).join('');
}

function renderAllHabits() {
    const container = document.getElementById('allHabits');
    const habits = db.getActiveHabits();

    if (habits.length === 0) {
        container.innerHTML = '<div class="empty-state">No habits yet. Create your first habit above!</div>';
        return;
    }

    container.innerHTML = habits.map(habit => {
        const streak = db.calculateStreak(habit.id);
        const streakClass = streak > 0 ? 'habit-streak' : 'habit-streak habit-streak-zero';
        const streakText = streak > 0 ? `🔥 ${streak}` : `🔥 0`;

        return `
            <div class="habit-item" data-habit-id="${habit.id}">
                <div class="habit-icon">${habit.icon}</div>
                <div class="habit-info">
                    <div class="habit-name">${habit.name}</div>
                    <div class="habit-frequency">${formatFrequency(habit)}</div>
                </div>
                <span class="${streakClass}">${streakText}</span>
                <div class="habit-actions">
                    <button class="btn-icon delete" onclick="deleteHabit(${habit.id})" title="Delete">🗑</button>
                </div>
            </div>
        `;
    }).join('');
}

function renderHabitsTable(animatedRow = null) {
    const tbody = document.getElementById('habitsTableBody');
    const countEl = document.getElementById('habitsCount');

    countEl.textContent = `${db.habits.length} row${db.habits.length !== 1 ? 's' : ''}`;

    tbody.innerHTML = db.habits.map(habit => {
        const animClass = animatedRow && animatedRow.id === habit.id ? `row-${animatedRow._animation}` : '';
        return `
            <tr class="${animClass}">
                <td><span class="data-id">${habit.id}</span></td>
                <td><span class="data-string">${habit.name}</span></td>
                <td>${habit.icon}</td>
                <td><span class="data-string">${habit.frequency_type}</span></td>
                <td>${habit.frequency_days ? `<span class="data-string">${habit.frequency_days}</span>` : '<span class="data-null">NULL</span>'}</td>
                <td>${habit.target_count ? `<span class="data-number">${habit.target_count}</span>` : '<span class="data-null">NULL</span>'}</td>
                <td><span class="data-date">${habit.created_at}</span></td>
                <td><span class="data-boolean">${habit.is_active}</span></td>
            </tr>
        `;
    }).join('');
}

function renderCompletionsTable(animatedRow = null, deletedRows = []) {
    const tbody = document.getElementById('completionsTableBody');
    const countEl = document.getElementById('completionsCount');

    // Include deleted rows temporarily for animation
    const allRows = [...db.completions];
    deletedRows.forEach(row => {
        if (!allRows.find(r => r.id === row.id)) {
            allRows.push(row);
        }
    });

    countEl.textContent = `${db.completions.length} row${db.completions.length !== 1 ? 's' : ''}`;

    tbody.innerHTML = allRows.map(completion => {
        let animClass = '';
        if (animatedRow && animatedRow.id === completion.id) {
            animClass = `row-${animatedRow._animation}`;
        } else if (deletedRows.find(r => r.id === completion.id)) {
            animClass = 'row-delete';
        }

        return `
            <tr class="${animClass}">
                <td><span class="data-id">${completion.id}</span></td>
                <td><span class="data-fk">${completion.habit_id}</span></td>
                <td><span class="data-date">${completion.completed_at}</span></td>
                <td>${completion.notes ? `<span class="data-string">${completion.notes}</span>` : '<span class="data-null">NULL</span>'}</td>
            </tr>
        `;
    }).join('');

    // Clean up deleted rows after animation
    if (deletedRows.length > 0) {
        setTimeout(() => {
            renderCompletionsTable();
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

    // Auto-scroll to top (newest)
    container.scrollTop = 0;
}

function formatSql(sql) {
    // Simple SQL syntax highlighting
    const keywords = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'FROM', 'WHERE', 'INTO', 'VALUES', 'SET', 'AND', 'OR', 'ORDER BY', 'GROUP BY', 'LIKE', 'IN', 'NULL', 'DATE', 'COUNT'];
    const tables = ['habits', 'completions'];

    let formatted = sql;

    // Escape HTML
    formatted = formatted.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Highlight keywords
    keywords.forEach(kw => {
        const regex = new RegExp(`\\b${kw}\\b`, 'gi');
        formatted = formatted.replace(regex, `<span class="keyword">${kw}</span>`);
    });

    // Highlight table names
    tables.forEach(table => {
        const regex = new RegExp(`\\b${table}\\b`, 'gi');
        formatted = formatted.replace(regex, `<span class="table-name">${table}</span>`);
    });

    return formatted;
}

// ==================== EVENT HANDLERS ====================

function toggleHabitCompletion(habitId) {
    const isCompleted = db.isCompletedOnDate(habitId, selectedDate);

    if (isCompleted) {
        const deleted = db.deleteCompletion(habitId, selectedDate);
        renderCompletionsTable(deleted);
    } else {
        const completion = db.insertCompletion(habitId, selectedDate);
        renderCompletionsTable(completion);
    }

    renderTodayHabits();
    renderAllHabits();
    renderQueryLog();
}

function toggleHabitExpand(habitId) {
    if (expandedHabits.has(habitId)) {
        expandedHabits.delete(habitId);
    } else {
        expandedHabits.add(habitId);
        // Initialize the detail month to current month if not set
        if (!habitDetailMonths[habitId]) {
            habitDetailMonths[habitId] = new Date();
        }
    }
    renderTodayHabits();
}

function changeHabitDetailMonth(habitId, delta) {
    if (!habitDetailMonths[habitId]) {
        habitDetailMonths[habitId] = new Date();
    }
    habitDetailMonths[habitId].setMonth(habitDetailMonths[habitId].getMonth() + delta);
    renderTodayHabits();
}

function deleteHabit(habitId) {
    const result = db.deleteHabit(habitId);

    if (result) {
        // Show deletion animation
        renderHabitsTable(result.habit);
        renderCompletionsTable(null, result.deletedCompletions);

        // Re-render after animation
        setTimeout(() => {
            renderHabitsTable();
            renderTodayHabits();
            renderAllHabits();
        }, 500);
    }

    renderQueryLog();
}

// Calendar navigation
document.getElementById('prevMonth').addEventListener('click', () => {
    calendarViewDate.setMonth(calendarViewDate.getMonth() - 1);
    renderCalendarWidget();
});

document.getElementById('nextMonth').addEventListener('click', () => {
    calendarViewDate.setMonth(calendarViewDate.getMonth() + 1);
    renderCalendarWidget();
});

document.getElementById('goToToday').addEventListener('click', () => {
    selectedDate = new Date();
    calendarViewDate = new Date();
    renderCalendarWidget();
    updateDateDisplay();
    renderTodayHabits();
});

// Form handling
document.getElementById('frequencyType').addEventListener('change', function() {
    const daysSelection = document.getElementById('daysSelection');
    const timesPerPeriod = document.getElementById('timesPerPeriod');
    const targetLabel = document.querySelector('#timesPerPeriod label');

    daysSelection.style.display = 'none';
    timesPerPeriod.style.display = 'none';

    switch (this.value) {
        case 'specific_days':
            daysSelection.style.display = 'block';
            break;
        case 'times_per_week':
            timesPerPeriod.style.display = 'block';
            targetLabel.textContent = 'Times per week';
            break;
        case 'times_per_month':
            timesPerPeriod.style.display = 'block';
            targetLabel.textContent = 'Times per month';
            break;
        case 'times_per_year':
            timesPerPeriod.style.display = 'block';
            targetLabel.textContent = 'Times per year';
            break;
    }
});

document.getElementById('addHabitForm').addEventListener('submit', function(e) {
    e.preventDefault();

    const name = document.getElementById('habitName').value.trim();
    const icon = document.getElementById('habitIcon').value;
    const frequencyType = document.getElementById('frequencyType').value;

    let frequencyDays = null;
    let targetCount = null;

    if (frequencyType === 'specific_days') {
        const checkedDays = document.querySelectorAll('#daysSelection input:checked');
        if (checkedDays.length === 0) {
            alert('Please select at least one day');
            return;
        }
        frequencyDays = Array.from(checkedDays).map(cb => cb.value).join(',');
    } else if (['times_per_week', 'times_per_month', 'times_per_year'].includes(frequencyType)) {
        targetCount = parseInt(document.getElementById('targetCount').value) || 1;
    }

    const newHabit = db.insertHabit({
        name,
        icon,
        frequencyType,
        frequencyDays,
        targetCount
    });

    // Update UI with animation
    renderHabitsTable(newHabit);
    renderTodayHabits();
    renderAllHabits();
    renderQueryLog();

    // Reset form
    this.reset();
    document.getElementById('daysSelection').style.display = 'none';
    document.getElementById('timesPerPeriod').style.display = 'none';
});

document.getElementById('clearQueryLog').addEventListener('click', function() {
    db.clearQueryLog();
    renderQueryLog();
});

// ERD Modal
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

// ==================== INITIALIZATION ====================

function seedSampleHabits() {
    // Only seed if database is empty
    if (db.habits.length > 0) return;

    // Backdate habits to 30 days ago so they show on past dates
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const createdAt = thirtyDaysAgo.toISOString();

    // Create habits with varied schedules (without triggering query log for cleaner start)
    const sampleHabits = [
        { name: 'Morning Meditation', icon: '🧘', frequencyType: 'daily', frequencyDays: null, targetCount: null },
        { name: 'Read for 30 min', icon: '📚', frequencyType: 'daily', frequencyDays: null, targetCount: null },
        { name: 'Drink 8 glasses of water', icon: '💧', frequencyType: 'daily', frequencyDays: null, targetCount: null },
        { name: 'Gym Workout', icon: '💪', frequencyType: 'specific_days', frequencyDays: '1,3,5', targetCount: null }, // Mon, Wed, Fri
        { name: 'Call Family', icon: '📞', frequencyType: 'specific_days', frequencyDays: '0,6', targetCount: null }, // Sat, Sun
        { name: 'Deep Clean Room', icon: '🧹', frequencyType: 'times_per_week', frequencyDays: null, targetCount: 2 },
        { name: 'Learn a New Recipe', icon: '🥗', frequencyType: 'times_per_month', frequencyDays: null, targetCount: 4 },
        { name: 'Take Vitamins', icon: '💊', frequencyType: 'daily', frequencyDays: null, targetCount: null },
    ];

    // Directly insert without logging (for cleaner initial state)
    sampleHabits.forEach(habit => {
        const id = db.getNextHabitId();
        db.habits.push({
            id,
            name: habit.name,
            icon: habit.icon,
            frequency_type: habit.frequencyType,
            frequency_days: habit.frequencyDays,
            target_count: habit.targetCount,
            created_at: createdAt,
            is_active: true
        });
    });

    db.save();
}

function init() {
    seedSampleHabits();
    updateDateDisplay();
    renderCalendarWidget();
    renderTodayHabits();
    renderAllHabits();
    renderHabitsTable();
    renderCompletionsTable();
    renderQueryLog();
}

// Start the app
init();
