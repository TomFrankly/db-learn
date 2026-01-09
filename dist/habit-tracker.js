// ==================== HABIT TRACKER MODULE ====================
// DB Learn v1.0 - Habit tracking with database visualization

const HabitTracker = {
    STORAGE_KEY: 'habitTrackerDB',
    habits: [],
    completions: [],
    nextHabitId: 1,
    nextCompletionId: 1,
    queryLog: [],
    currentDate: new Date(),
    expandedHabitId: null,

    // ==================== DATABASE OPERATIONS ====================

    save() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
            habits: this.habits,
            completions: this.completions,
            nextHabitId: this.nextHabitId,
            nextCompletionId: this.nextCompletionId
        }));
    },

    load() {
        const stored = localStorage.getItem(this.STORAGE_KEY);
        if (stored) {
            try {
                const data = JSON.parse(stored);
                this.habits = data.habits || [];
                this.completions = data.completions || [];
                this.nextHabitId = data.nextHabitId || 1;
                this.nextCompletionId = data.nextCompletionId || 1;
            } catch (e) {
                console.error('Failed to load habit tracker data:', e);
            }
        }
    },

    clearAll() {
        this.habits = [];
        this.completions = [];
        this.nextHabitId = 1;
        this.nextCompletionId = 1;
        this.queryLog = [];
        localStorage.removeItem(this.STORAGE_KEY);
    },

    insertHabit(habit) {
        const id = this.nextHabitId++;
        const newHabit = {
            id,
            name: habit.name,
            category: habit.category,
            frequency_type: habit.frequency_type,
            frequency_value: habit.frequency_value,
            created_at: new Date().toISOString()
        };
        this.habits.push(newHabit);

        this.logQuery('insert', `INSERT INTO habits (name, category, frequency_type, frequency_value, created_at)
VALUES ('${newHabit.name}', '${newHabit.category}', '${newHabit.frequency_type}', '${newHabit.frequency_value}', '${newHabit.created_at}');`);

        this.save();
        return { ...newHabit, _animation: 'insert' };
    },

    insertCompletion(habitId) {
        const id = this.nextCompletionId++;
        const completion = {
            id,
            habit_id: habitId,
            completed_at: this.currentDate.toISOString()
        };
        this.completions.push(completion);

        this.logQuery('insert', `INSERT INTO completions (habit_id, completed_at)
VALUES (${habitId}, '${completion.completed_at}');`);

        this.save();
        return { ...completion, _animation: 'insert' };
    },

    deleteCompletion(habitId, date) {
        const completion = this.completions.find(c =>
            c.habit_id === habitId && isSameDay(c.completed_at, date)
        );
        if (completion) {
            this.completions = this.completions.filter(c => c.id !== completion.id);
            this.logQuery('delete', `DELETE FROM completions WHERE id = ${completion.id};`);
            this.save();
            return { ...completion, _animation: 'delete' };
        }
        return null;
    },

    deleteHabit(habitId) {
        const habitIndex = this.habits.findIndex(h => h.id === habitId);
        if (habitIndex !== -1) {
            const habit = this.habits[habitIndex];
            const completionsToDelete = this.completions.filter(c => c.habit_id === habitId);
            this.completions = this.completions.filter(c => c.habit_id !== habitId);

            if (completionsToDelete.length > 0) {
                this.logQuery('delete', `DELETE FROM completions WHERE habit_id = ${habitId}; -- ${completionsToDelete.length} row(s)`);
            }

            this.habits.splice(habitIndex, 1);
            this.logQuery('delete', `DELETE FROM habits WHERE id = ${habitId};`);
            this.save();

            return {
                habit: { ...habit, _animation: 'delete' },
                deletedCompletions: completionsToDelete.map(c => ({ ...c, _animation: 'delete' }))
            };
        }
        return null;
    },

    isCompletedOnDate(habitId, date) {
        return this.completions.some(c =>
            c.habit_id === habitId && isSameDay(c.completed_at, date)
        );
    },

    toggleCompletion(habitId) {
        if (this.isCompletedOnDate(habitId, this.currentDate)) {
            return this.deleteCompletion(habitId, this.currentDate);
        } else {
            return this.insertCompletion(habitId);
        }
    },

    logQuery(type, sql) {
        this.queryLog.push({ type, sql, timestamp: new Date().toISOString() });
    },

    clearQueryLog() {
        this.queryLog = [];
    },

    // ==================== HABIT LOGIC ====================

    getHabitsForDate(date) {
        return this.habits.filter(h => new Date(h.created_at) <= date);
    },

    shouldShowHabitOnDate(habit, date) {
        const created = new Date(habit.created_at);
        if (date < created) return false;

        const dayOfWeek = date.getDay();

        switch (habit.frequency_type) {
            case 'daily':
                return true;
            case 'specific_days':
                if (Array.isArray(habit.frequency_value)) {
                    return habit.frequency_value.includes(dayOfWeek);
                }
                return true;
            case 'times_per_week':
            case 'times_per_month':
            case 'times_per_year':
                return true; // Always show, progress tracked differently
            default:
                return true;
        }
    },

    calculateStreak(habit) {
        if (['times_per_week', 'times_per_month', 'times_per_year'].includes(habit.frequency_type)) {
            return this.calculatePeriodProgress(habit);
        }

        let streak = 0;
        let checkDate = new Date();
        checkDate.setHours(0, 0, 0, 0);

        while (true) {
            if (!this.shouldShowHabitOnDate(habit, checkDate)) {
                checkDate.setDate(checkDate.getDate() - 1);
                continue;
            }

            if (checkDate < new Date(habit.created_at)) break;

            if (this.isCompletedOnDate(habit.id, checkDate)) {
                streak++;
                checkDate.setDate(checkDate.getDate() - 1);
            } else {
                break;
            }
        }

        return { type: 'streak', value: streak };
    },

    calculatePeriodProgress(habit) {
        const now = new Date();
        let startDate, endDate, target;

        switch (habit.frequency_type) {
            case 'times_per_week':
                const dayOfWeek = now.getDay();
                startDate = new Date(now);
                startDate.setDate(now.getDate() - dayOfWeek);
                endDate = new Date(startDate);
                endDate.setDate(startDate.getDate() + 6);
                target = habit.frequency_value;
                break;
            case 'times_per_month':
                startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                target = habit.frequency_value;
                break;
            case 'times_per_year':
                startDate = new Date(now.getFullYear(), 0, 1);
                endDate = new Date(now.getFullYear(), 11, 31);
                target = habit.frequency_value;
                break;
        }

        const count = this.completions.filter(c =>
            c.habit_id === habit.id &&
            new Date(c.completed_at) >= startDate &&
            new Date(c.completed_at) <= endDate
        ).length;

        return { type: 'progress', value: count, target };
    },

    // ==================== UI RENDERING ====================

    render() {
        console.log('HabitTracker.render() called');
        try {
            this.renderAppContent();
            this.renderDbContent();
        } catch (e) {
            console.error('HabitTracker render error:', e);
        }
    },

    renderAppContent() {
        console.log('HabitTracker.renderAppContent() called');
        const container = document.getElementById('appContent');
        if (!container) {
            console.error('appContent container not found');
            return;
        }

        const dateStr = this.currentDate.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });

        const isToday = isSameDay(this.currentDate, new Date());
        console.log('Getting habits for date:', this.currentDate);
        const habits = this.getHabitsForDate(this.currentDate).filter(h =>
            this.shouldShowHabitOnDate(h, this.currentDate)
        );

        const self = this;
        const habitItem = (habit) => {
            const icon = categoryIcons[habit.category] || '📦';
            const completed = self.isCompletedOnDate(habit.id, self.currentDate);
            const streakData = self.calculateStreak(habit);
            const isExpanded = self.expandedHabitId === habit.id;

            let streakDisplay = '';
            if (streakData.type === 'streak') {
                streakDisplay = `🔥 ${streakData.value}`;
            } else {
                streakDisplay = `${streakData.value}/${streakData.target}`;
            }

            let expandedContent = '';
            if (isExpanded) {
                expandedContent = self.renderHabitCalendar(habit);
            }

            const freqLabel = self.getFrequencyLabel(habit);

            return `
                <div class="bg-base-300 rounded-lg overflow-hidden">
                    <div class="flex items-center gap-3 p-3">
                        <button class="w-6 h-6 rounded border-2 flex items-center justify-center transition-all
                            ${completed ? 'bg-success border-success text-success-content' : 'border-neutral-content/30 hover:border-success'}"
                            onclick="HabitTracker.toggleCompletionAction(${habit.id})">
                            ${completed ? '✓' : ''}
                        </button>
                        <div class="w-10 h-10 rounded-lg bg-base-100 flex items-center justify-center">${icon}</div>
                        <div class="flex-1 min-w-0">
                            <div class="font-medium truncate">${habit.name}</div>
                            <div class="text-xs text-neutral-content">${freqLabel}</div>
                        </div>
                        <div class="text-sm font-mono text-neutral-content">${streakDisplay}</div>
                        <button class="btn btn-xs btn-ghost btn-square" onclick="HabitTracker.toggleExpand(${habit.id})">
                            ${isExpanded ? '▲' : '▼'}
                        </button>
                        <button class="btn btn-xs btn-ghost btn-square text-error" onclick="HabitTracker.deleteHabitAction(${habit.id})">🗑</button>
                    </div>
                    ${expandedContent}
                </div>
            `;
        };

        console.log('About to set container.innerHTML for HabitTracker. Habits count:', habits.length);
        container.innerHTML = `
            <div class="p-4 space-y-6">
                <!-- Date Navigation -->
                <div class="flex items-center justify-between">
                    <button class="btn btn-sm btn-ghost" onclick="HabitTracker.navigateDate(-1)">←</button>
                    <div class="text-center">
                        <div class="font-semibold">${dateStr}</div>
                        ${!isToday ? `<button class="btn btn-xs btn-ghost mt-1" onclick="HabitTracker.goToToday()">Today</button>` : ''}
                    </div>
                    <button class="btn btn-sm btn-ghost" onclick="HabitTracker.navigateDate(1)">→</button>
                </div>

                <!-- Add Habit Form -->
                <div>
                    <h2 class="text-xs uppercase tracking-wider text-neutral-content font-semibold mb-3">Add New Habit</h2>
                    <form id="htAddHabitForm" class="space-y-3">
                        <input type="text" name="habitName" placeholder="Habit name..." class="input input-bordered input-sm w-full bg-base-300" required>
                        <select name="category" class="select select-bordered select-sm w-full bg-base-300">
                            <option value="health">💪 Health</option>
                            <option value="mindfulness">🧘 Mindfulness</option>
                            <option value="productivity">⚡ Productivity</option>
                            <option value="learning">📚 Learning</option>
                            <option value="social">👥 Social</option>
                            <option value="finance">💰 Finance</option>
                            <option value="creative">🎭 Creative</option>
                            <option value="other">📦 Other</option>
                        </select>
                        <select name="frequencyType" class="select select-bordered select-sm w-full bg-base-300" onchange="HabitTracker.updateFrequencyOptions(this)">
                            <option value="daily">Daily</option>
                            <option value="specific_days">Specific days</option>
                            <option value="times_per_week">X times per week</option>
                            <option value="times_per_month">X times per month</option>
                        </select>
                        <div id="htFrequencyOptions"></div>
                        <button type="submit" class="btn btn-primary btn-sm w-full">Add Habit</button>
                    </form>
                </div>

                <!-- Habits List -->
                <div>
                    <h2 class="text-xs uppercase tracking-wider text-neutral-content font-semibold mb-3">Today's Habits</h2>
                    <div class="space-y-2">
                        ${habits.length
                            ? habits.map(h => habitItem(h)).join('')
                            : '<div class="text-center text-neutral-content/50 py-4 text-sm">No habits for this date</div>'
                        }
                    </div>
                </div>
            </div>
        `;

        // Bind form
        document.getElementById('htAddHabitForm')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const form = e.target;
            const name = form.habitName.value.trim();
            const category = form.category.value;
            const frequencyType = form.frequencyType.value;
            let frequencyValue = null;

            if (frequencyType === 'specific_days') {
                const checkboxes = form.querySelectorAll('input[name="days"]:checked');
                frequencyValue = Array.from(checkboxes).map(cb => parseInt(cb.value));
            } else if (frequencyType.startsWith('times_per_')) {
                frequencyValue = parseInt(form.frequencyValue?.value || 1);
            }

            if (name) {
                this.insertHabit({ name, category, frequency_type: frequencyType, frequency_value: frequencyValue });
                form.reset();
                this.render();
            }
        });

        this.updateFrequencyOptions(document.querySelector('[name="frequencyType"]'));
    },

    updateFrequencyOptions(select) {
        const container = document.getElementById('htFrequencyOptions');
        if (!container || !select) return;

        const type = select.value;

        if (type === 'specific_days') {
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            container.innerHTML = `
                <div class="flex flex-wrap gap-2">
                    ${days.map((day, i) => `
                        <label class="flex items-center gap-1 text-sm">
                            <input type="checkbox" name="days" value="${i}" class="checkbox checkbox-xs">
                            ${day}
                        </label>
                    `).join('')}
                </div>
            `;
        } else if (type.startsWith('times_per_')) {
            const period = type.replace('times_per_', '');
            container.innerHTML = `
                <input type="number" name="frequencyValue" min="1" max="100" value="3"
                    class="input input-bordered input-sm w-full bg-base-300"
                    placeholder="Times per ${period}">
            `;
        } else {
            container.innerHTML = '';
        }
    },

    getFrequencyLabel(habit) {
        switch (habit.frequency_type) {
            case 'daily': return 'Every day';
            case 'specific_days':
                const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                if (Array.isArray(habit.frequency_value)) {
                    return habit.frequency_value.map(d => days[d]).join(', ');
                }
                return 'Specific days';
            case 'times_per_week': return `${habit.frequency_value || 1}x per week`;
            case 'times_per_month': return `${habit.frequency_value || 1}x per month`;
            case 'times_per_year': return `${habit.frequency_value || 1}x per year`;
            default: return '';
        }
    },

    renderHabitCalendar(habit) {
        const weeks = [];
        const today = new Date();
        let date = new Date(today);
        date.setDate(date.getDate() - 27); // Start 4 weeks ago

        for (let w = 0; w < 4; w++) {
            const days = [];
            for (let d = 0; d < 7; d++) {
                const isCompleted = this.isCompletedOnDate(habit.id, date);
                const shouldShow = this.shouldShowHabitOnDate(habit, date);
                const isPast = date <= today;
                const isFuture = date > today;

                let className = 'w-6 h-6 rounded text-xs flex items-center justify-center ';
                if (isFuture) {
                    className += 'bg-base-100/30 text-neutral-content/30';
                } else if (isCompleted) {
                    className += 'bg-success text-success-content';
                } else if (shouldShow && isPast) {
                    className += 'bg-error/30 text-error';
                } else {
                    className += 'bg-base-100/50 text-neutral-content/50';
                }

                days.push(`<div class="${className}">${isCompleted ? '✓' : shouldShow && isPast && !isFuture ? '✗' : ''}</div>`);
                date.setDate(date.getDate() + 1);
            }
            weeks.push(`<div class="flex gap-1">${days.join('')}</div>`);
        }

        return `
            <div class="px-3 pb-3 pt-1 border-t border-neutral">
                <div class="text-xs text-neutral-content mb-2">Last 4 weeks</div>
                <div class="space-y-1">${weeks.join('')}</div>
            </div>
        `;
    },

    renderDbContent() {
        const container = document.getElementById('dbContent');
        if (!container) return;

        container.innerHTML = `
            <div id="htHabitsTable"></div>
            <div id="htCompletionsTable"></div>
            <div id="htQueryLog"></div>
        `;

        // Habits table
        renderDbTable('htHabitsTable', 'habits', [
            { key: 'id', label: 'id', type: 'id' },
            { key: 'name', label: 'name' },
            { key: 'category', label: 'category' },
            { key: 'frequency_type', label: 'frequency_type' },
            { key: 'frequency_value', label: 'frequency_value' },
            { key: 'created_at', label: 'created_at', type: 'date' }
        ], this.habits);

        // Completions table
        renderDbTable('htCompletionsTable', 'completions', [
            { key: 'id', label: 'id', type: 'id' },
            { key: 'habit_id', label: 'habit_id', type: 'fk' },
            { key: 'completed_at', label: 'completed_at', type: 'date' }
        ], this.completions);

        // Query log
        renderQueryLog('htQueryLog', this.queryLog);

        // Render ERD
        renderErd([
            {
                name: 'habits',
                columns: [
                    { key: 'pk', name: 'id', type: 'INTEGER' },
                    { key: '', name: 'name', type: 'VARCHAR(255)' },
                    { key: '', name: 'category', type: 'VARCHAR(50)' },
                    { key: '', name: 'frequency_type', type: 'VARCHAR(50)' },
                    { key: '', name: 'frequency_value', type: 'JSON' },
                    { key: '', name: 'created_at', type: 'TIMESTAMP' }
                ]
            },
            {
                name: 'completions',
                columns: [
                    { key: 'pk', name: 'id', type: 'INTEGER' },
                    { key: 'fk', name: 'habit_id', type: 'INTEGER' },
                    { key: '', name: 'completed_at', type: 'TIMESTAMP' }
                ]
            }
        ]);
    },

    // ==================== ACTIONS ====================

    toggleCompletionAction(habitId) {
        this.toggleCompletion(habitId);
        this.render();
    },

    deleteHabitAction(habitId) {
        this.deleteHabit(habitId);
        this.render();
    },

    toggleExpand(habitId) {
        this.expandedHabitId = this.expandedHabitId === habitId ? null : habitId;
        this.render();
    },

    navigateDate(delta) {
        this.currentDate.setDate(this.currentDate.getDate() + delta);
        this.render();
    },

    goToToday() {
        this.currentDate = new Date();
        this.render();
    },

    // ==================== INITIALIZATION ====================

    init() {
        console.log('HabitTracker.init() called');
        this.load();
        console.log('HabitTracker loaded, habits:', this.habits.length);

        // Seed sample data if empty
        if (this.habits.length === 0) {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const samples = [
                { name: 'Morning meditation', category: 'mindfulness', frequency_type: 'daily', frequency_value: null },
                { name: 'Exercise', category: 'health', frequency_type: 'times_per_week', frequency_value: 4 },
                { name: 'Read for 30 minutes', category: 'learning', frequency_type: 'daily', frequency_value: null },
                { name: 'Practice guitar', category: 'creative', frequency_type: 'specific_days', frequency_value: [1, 3, 5] },
                { name: 'Review finances', category: 'finance', frequency_type: 'times_per_month', frequency_value: 2 }
            ];

            samples.forEach(h => {
                const id = this.nextHabitId++;
                this.habits.push({
                    id,
                    name: h.name,
                    category: h.category,
                    frequency_type: h.frequency_type,
                    frequency_value: h.frequency_value,
                    created_at: thirtyDaysAgo.toISOString()
                });
            });
            this.save();
        }

        this.render();
    },

    cleanup() {
        // No timers to clean up
    }
};
