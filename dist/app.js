// ==================== MAIN APP CONTROLLER ====================

let currentTool = null;

const tools = {
    'time-tracker': {
        name: 'Time Tracker',
        icon: '⏱️',
        subtitle: 'Track time spent on tasks',
        module: TimeTracker
    },
    'habit-tracker': {
        name: 'Habit Tracker',
        icon: '✅',
        subtitle: 'Build better habits',
        module: HabitTracker
    }
};

function switchTool(toolId) {
    console.log('Switching to tool:', toolId);

    // Don't switch if already on this tool
    if (currentTool === toolId) {
        console.log('Already on this tool');
        return;
    }

    // Cleanup current tool
    if (currentTool) {
        const currentToolConfig = tools[currentTool];
        if (currentToolConfig && currentToolConfig.module && currentToolConfig.module.cleanup) {
            currentToolConfig.module.cleanup();
        }
    }

    // Switch to new tool
    currentTool = toolId;
    const newToolConfig = tools[toolId];

    if (!newToolConfig) {
        console.error('Tool not found:', toolId);
        return;
    }

    // Update header
    document.getElementById('currentToolIcon').textContent = newToolConfig.icon;
    document.getElementById('currentToolName').textContent = newToolConfig.name;
    document.getElementById('toolSubtitle').textContent = newToolConfig.subtitle;

    // Close dropdown by removing focus and closing any open dropdowns
    document.activeElement.blur();

    // Initialize new tool
    console.log('Initializing module:', newToolConfig.name);
    newToolConfig.module.init();
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing app...');
    // Start with time tracker
    switchTool('time-tracker');
});
