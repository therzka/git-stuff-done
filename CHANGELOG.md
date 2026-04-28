# Changelog

All notable changes to git-stuff-done are documented here.

## 2026-04-28

### Added

- My PRs now shows explicit review-decision indicators for approved and changes-requested states

## 2026-04-27

### Added

- **PR branch name** displayed in the My PRs panel as a pill badge alongside the repo, PR number, and line change counts

### Fixed

- Stabilized refresh callbacks in My PRs and My Issues panels using `isDemoRef` pattern to prevent duplicate fetches on remount
- Coalesced concurrent `/api/prs` and `/api/issues` requests server-side so rapid panel switches share one in-flight request instead of firing multiple
- Serialized authored/assigned GitHub Search API calls and added retry-on-zero to handle spurious empty responses during GitHub Search incidents
- Preserved cached PR/issue data when the API returns an empty result set, preventing panels from incorrectly clearing while GitHub Search is degraded

### Changed

- My Issues panel: open PR pills now use GitHub's green (`#1F883D`), merged PR pills use GitHub's purple (`#8250DF`)
- Copilot badge on issues renamed to "Assigned to Copilot" and restyled to neutral gray

---

## 2026-04-17

### Added

- **Widescreen row layout mode** — panels arrange horizontally in a single row on wide displays; toggle via layout menu

### Changed

- **Facelift** — replaced purple theme with a cool blue-teal color palette across the entire dashboard
- Pointer cursor on interactive buttons; bolder date header typography

---

## 2026-04-16

### Added

- **Drag-to-reorder todos** — grab any TODO item and drag it to reorder within the list

### Fixed

- Used `CSS.Translate` instead of `CSS.Transform` during drag to prevent text scaling artifacts

---

## 2026-04-15

### Added

- Bare Slack URLs pasted into the log editor are automatically linkified as `[Slack link](url)`

---

## 2026-04-08

### Fixed

- Pressing Space at the end of a link no longer stays inside the link mark; cursor correctly escapes to plain text

---

## 2026-04-07

### Added

- **Image support** — drag-and-drop or paste images directly into the Work Log editor; images are stored in `attachments/YYYY-MM-DD/`
- **Code fencing** — triple-backtick code blocks rendered in the editor with monospace styling

---

## 2026-04-03

### Added

- **Drag-and-drop panel reordering** — grab any panel by its title bar and drag it to a new position; order persists to `localStorage`
- Infinite scroll height in column layout mode

### Fixed

- Grip icon replaces invisible drag overlay for clearer affordance
- Single `SortableContext` for cross-column drag; reset button restores default panel order
- Drag handle restricted to title bar only; grab cursor removed from panel card body

---

## 2026-04-01

### Added

- **Slack thread viewer** — click a Slack link in the log to open a rich-text modal preview of the thread; available in demo mode
- `@mention` autocomplete for GitHub org members in the Work Log editor

### Changed

- PR/issue cross-references unified to `Title (owner/repo#number)` format

---

## 2026-03-25

### Added

- AI search results can be saved and downloaded; saved results visible in the Summaries modal

---

## 2026-03-24

### Changed

- Agent Sessions panel now only shows sessions with a linked PR
- Agent Sessions: PR state pills (open/merged/closed), title links to Copilot agent task page; merged PRs filtered out by default
- Neutral color used for open/draft PR pills

### Fixed

- Draft PR sessions now visible; fixed null `pullRequestUrl` crash

---

## 2026-03-23

### Added

- **Agent Sessions panel** — shows Copilot coding agent tasks from GitHub via `gh agent-task list`; sessions grouped by date with PR badges (open/merged/closed), state indicators (running/timed out), and hover-to-insert into Work Log; hidden by default, enabled via panel menu
- New `GET /api/sessions` route backed by `gh agent-task list` (requires gh CLI ≥ 2.80.0)

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
