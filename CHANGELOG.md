# Changelog

All notable changes to git-stuff-done are documented here.

## [Unreleased] — 2026-03-23

### Fixed
- Linkify button remained permanently disabled when starting a new empty log and typing — `content` state was never updated from editor input, only from the API fetch on load
- Trailing space now inserted after links pasted or inserted into the log editor, so the cursor escapes the link node and typing continues naturally

### Changed
- Cross-panel link inserts (from MyPRs, MyIssues, Notifications) now append a trailing space
- Direct paste (Ctrl+V) of URLs/markdown links now appends a trailing space via a new Tiptap extension

---

## 2026-03-12

### Fixed
- Commit button now correctly distinguishes server errors from no-changes response (#15)

### Performance
- AI search optimized: single LLM round-trip, fast classifier, incremental recent-first accumulation (#12)

---

## 2026-03-11

### Added
- Configurable font size setting persisted to `config.json`; font size and config supported in demo mode

### Fixed
- Commit button size instability and jarring color flash on state change

---

## 2026-03-10

### Added
- Stop button to cancel in-progress AI searches, with server-side abort support
- Auto-PR feature (#11)
- Copilot assign button and modal in AiModal

### Fixed
- Stream error when aborting an in-progress search
- Recent-first regression: restored log accumulation across search iterations
- Classifier prompt improved to avoid exhaustive misclassification

---

## 2026-03-09

### Added
- Saved Summaries modal: browse, preview, and delete saved summaries (#10)
- AI Usage preset and smart date auto-fill for summary templates
- Rich text AI results with markdown-on-copy; streaming search progress; dynamic model selection (#8)
- `MarkdownViewer` component with prose styles

### Fixed
- Strip issue/PR sub-paths and fragments before linkifying to avoid broken links
- Badge colors; MarkdownViewer spacing, line-height, and code block contrast
- Capitalize AI and other acronyms in summary labels

---

## 2026-03-08

### Added
- Combined AI modal replacing separate Search and Summary modals — single modal with tabs
- Stream search progress via NDJSON for real-time feedback
- Save filename slug derived from prompt text

### Changed
- Consolidated to single demo deployment workflow

---

## 2026-02-22

### Added
- Calendar date picker with per-day content indicators
- Summary model picker
- Demo mode for public deployment
- Save AI summaries to the repository
- Configurable ignored repos for GitHub org filtering

### Changed
- Rebranded project from LogPilot to **git-stuff-done**
- Major layout overhaul: dark mode, resizable panels, merged log view
- External data directory support; general cleanup and documentation pass

---

## 2026-02-21

### Added
- Initial dashboard implementation (LogPilot): Work Log editor, TODO list, My PRs, GitHub Notifications panels
- Rich markdown editor with auto-enrichment on save and date-aware TODOs
- Inline TODO editing and AI suggestion improvements
- GitHub notifications filtered to open issues and PRs only
- Hourly auto-commit and push to GitHub
- Motivational quote header
- Server-side logging for all API routes
