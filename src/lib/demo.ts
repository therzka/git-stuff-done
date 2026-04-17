import { TodoItem } from "@/lib/files";
import { COPILOT_AGENT_LOGIN } from "@/lib/constants";

export const DEMO_CONFIG = {
  ignoredRepos: ["noisy-bot-repo", "archived-2024"],
  fontSize: "1",
};

export const DEMO_SLACK_THREAD = `**@sarah** — 2:45 PM
Let's prioritize mobile responsiveness for Q3. The analytics show 40% of our users are on mobile devices, but the dashboard is barely usable on phones.

**@alex** — 2:47 PM
Agreed. I can start on the responsive layout next week. Should we also address the API latency issue? It's causing slow chart renders on mobile networks.

**@you** — 2:50 PM
Yes to both! Let me create tickets for:
- Mobile responsive layout
- API response caching
- Chart lazy loading

I'll add these to the Q3 roadmap doc.`;

export const DEMO_LOG_CONTENT = `
- **Project: Analytics Dashboard**
  - [x] Refactor data fetching hook to use SWR
  - [x] Fix hydration mismatch error in chart component
  - [ ] Add unit tests for date range picker
  - Meeting with @sarah to discuss Q3 roadmap — [Slack thread](https://example.slack.com/archives/C01ABC123/p1234567890)
    - Need to prioritize mobile responsiveness
    - backend API latency is a concern
- **Code Review**
  - Reviewed [feat: Add dark mode toggle (#45)](https://github.com/acme/frontend/pull/45)
    - Great work on the color palette!
    - Suggested using CSS variables for better maintainability
  - Reviewed [fix: API timeout handling (#48)](https://github.com/acme/backend/pull/48)
- **Learning**
  - Watched Next.js 14 server actions tutorial
  - Read article about React Compiler optimizations
`.trim();

export const DEMO_RICH_LOG_CONTENT = `
- **Project: Analytics Dashboard**
  - [x] Refactor data fetching hook to use SWR
  - [x] Fix hydration mismatch error in chart component
  - [ ] Add unit tests for date range picker
  - Meeting with @sarah to discuss Q3 roadmap — [Slack thread](https://example.slack.com/archives/C01ABC123/p1234567890)
    - Need to prioritize mobile responsiveness
    - backend API latency is a concern
- **Code Review**
  - Reviewed [feat: Add dark mode toggle (#45)](https://github.com/acme/frontend/pull/45)
    - Great work on the color palette!
    - Suggested using CSS variables for better maintainability
  - Reviewed [fix: API timeout handling (#48)](https://github.com/acme/backend/pull/48)
- **Learning**
  - Watched Next.js 14 server actions tutorial
  - Read article about React Compiler optimizations

---
**Summary**
Today focused on the Analytics Dashboard refactoring and bug fixing. Also conducted code reviews for frontend features and backend fixes.
`.trim();

export const DEMO_SUGGESTED_TODOS: TodoItem[] = [
  {
    id: "s1",
    title: "Follow up on mobile responsiveness priority",
    done: false,
    source: "suggested",
    createdAt: new Date().toISOString(),
  },
  {
    id: "s2",
    title: "Check backend API latency metrics",
    done: false,
    source: "suggested",
    createdAt: new Date().toISOString(),
  },
];

export const DEMO_TODOS: TodoItem[] = [
  {
    id: "1",
    title: "Review PR #45 feedback",
    done: false,
    source: "manual",
    createdAt: new Date().toISOString(),
  },
  {
    id: "2",
    title: "Update documentation for API endpoints",
    done: true,
    source: "manual",
    createdAt: new Date().toISOString(),
  },
  {
    id: "3",
    title: "Schedule sync with design team",
    done: false,
    source: "suggested",
    createdAt: new Date().toISOString(),
  },
  {
    id: "4",
    title:
      "Investigate memory leak in worker — see https://github.com/acme/backend/issues/99",
    done: false,
    source: "manual",
    createdAt: new Date().toISOString(),
  },
];

export const DEMO_PRS = [
  {
    id: 101,
    number: 52,
    title: "feat: Add user settings page",
    url: "#",
    repoFullName: "acme/frontend",
    state: "open",
    draft: false,
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 3600000).toISOString(),
    additions: 450,
    deletions: 120,
    reviewDecision: "APPROVED",
    ciStatus: "success" as const,
    unresolvedThreads: 0,
    mergeQueueState: "merging" as const,
    authorLogin: "user",
    isAssignee: false,
  },
  {
    id: 102,
    number: 53,
    title: "fix: Login redirect loop",
    url: "#",
    repoFullName: "acme/frontend",
    state: "open",
    draft: true,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    updatedAt: new Date(Date.now() - 7200000).toISOString(),
    additions: 15,
    deletions: 5,
    reviewDecision: null,
    ciStatus: "failure" as const,
    unresolvedThreads: 2,
    mergeQueueState: null,
    authorLogin: "Copilot",
    isAssignee: true,
  },
];

export const DEMO_NOTIFICATIONS = [
  {
    id: "n1",
    reason: "review_requested",
    title: "refactor: Migrate to Tailwind v4",
    url: "https://api.github.com/repos/acme-corp/frontend/pulls/101",
    repoFullName: "acme/frontend",
    type: "PullRequest",
    updatedAt: new Date(Date.now() - 1800000).toISOString(),
    unread: true,
  },
  {
    id: "n2",
    reason: "mention",
    title: "bug: Chart crashes on mobile",
    url: "https://api.github.com/repos/acme-corp/frontend/issues/105",
    repoFullName: "acme/frontend",
    type: "Issue",
    updatedAt: new Date(Date.now() - 3600000 * 4).toISOString(),
    unread: true,
  },
  {
    id: "n3",
    reason: "assign",
    title: "docs: Update contributing guide",
    url: "https://api.github.com/repos/acme-corp/docs/issues/12",
    repoFullName: "acme/docs",
    type: "Issue",
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
    unread: false,
  },
];

export const DEMO_ISSUES = [
  {
    id: 201,
    number: 105,
    title: "bug: Chart crashes on mobile Safari",
    url: "#",
    repoFullName: "acme/frontend",
    state: "open",
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
    updatedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    labels: ["bug", "P1"],
    commentCount: 4,
    author: "designer42",
    assignees: ["you"],
    linkedPRs: [
      { number: 421, title: "fix: crash on mobile Safari chart render", url: "#", state: "OPEN", isDraft: false },
    ],
  },
  {
    id: 202,
    number: 88,
    title: "feat: Support dark mode in email templates",
    url: "#",
    repoFullName: "acme/mailer",
    state: "open",
    createdAt: new Date(Date.now() - 86400000 * 7).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
    labels: ["enhancement"],
    commentCount: 1,
    author: "pm-lead",
    assignees: ["you", COPILOT_AGENT_LOGIN],
    linkedPRs: [
      { number: 90, title: "feat: dark mode email templates (WIP)", url: "#", state: "OPEN", isDraft: true },
    ],
  },
  {
    id: 203,
    number: 42,
    title: "docs: Update API migration guide for v3",
    url: "#",
    repoFullName: "acme/docs",
    state: "open",
    createdAt: new Date(Date.now() - 86400000 * 14).toISOString(),
    updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    labels: ["documentation"],
    commentCount: 0,
    author: "tech-writer",
    assignees: ["you"],
    linkedPRs: [],
  },
];
