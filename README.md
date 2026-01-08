# DB Learn

Interactive educational tools for learning relational database concepts. See the SQL happening behind every click.

## What is this?

DB Learn provides hands-on mini-apps where you can use familiar interfaces (time tracker, habit tracker) while watching the underlying database operations in real-time. Every button click shows you the INSERT, UPDATE, DELETE, and SELECT statements that would run in a real database.

**Live Demo:** [Coming soon]

## Features

### Time Tracker
Track time spent on projects and tasks. Demonstrates:
- **One-to-Many Relationships**: Tasks have many work sessions
- **Foreign Keys**: Sessions reference their parent task via `task_id`
- **Aggregation**: Total time is computed with `SUM(duration)`, not stored
- **NULL Values**: Active sessions have `ended_at = NULL`

### Habit Tracker
Track daily habits with completion history. Demonstrates:
- **Many-to-Many Pattern**: Habits and dates connected via completions table
- **Toggle Operations**: Checking a habit = INSERT, unchecking = DELETE
- **Date Filtering**: Querying completions for specific dates
- **Flexible Schema**: Frequency stored as JSON-like values

### Educational Features

- **Live Database View**: See tables update in real-time as you interact
- **Query Log**: Watch the SQL statements scroll by
- **ERD Modal**: View the entity relationship diagram
- **Alt+Click Explanations**: Hold Alt/Option and click any button to see:
  - Step-by-step breakdown of what happens
  - JavaScript code snippets
  - Equivalent SQL statements
  - Database concepts being demonstrated

## Database Concepts Covered

- Primary Keys & Auto-increment
- Foreign Keys & Referential Integrity
- INSERT, UPDATE, DELETE, SELECT statements
- WHERE clauses and filtering
- SUM, COUNT aggregations
- NULL values and their meaning
- One-to-Many relationships
- Cascade delete patterns
- Normalized vs denormalized data

## Tech Stack

- Vanilla JavaScript (no frameworks)
- Tailwind CSS + DaisyUI
- In-memory data structures simulating database tables
- No backend required - runs entirely in the browser

## Development

```bash
# Install dependencies
npm install

# Watch for CSS changes during development
npm run dev

# Build CSS for production
npm run build
```

## Project Structure

```
dist/               # Deployable static files
├── index.html      # Main HTML file
├── output.css      # Compiled Tailwind CSS
├── shared.js       # Shared utilities, rendering, code explanations
├── time-tracker.js # Time Tracker app logic
├── habit-tracker.js# Habit Tracker app logic
└── app.js          # App initialization and tool switching

src/
└── input.css       # Tailwind source CSS with custom styles
```

## License

ISC
