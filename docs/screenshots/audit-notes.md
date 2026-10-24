# Baseline UI audit

Reviewed full-page screenshots at 360×740, 390×844, 430×932, 768×1024, and 1440×900 across Today, Activities, timer running, Week, Month, Year, Settings, add-activity dialog, dark mode, and the empty-search state.

- The timer hero collapses badly on phones: its ring overlays the activity title, duration controls, and primary action.
- The fixed bottom navigation covers the page while scrolling, and it repeats period navigation instead of providing the requested Today, Activities, Stats, and Settings destinations.
- Controls and labels are too small across phone and desktop; many buttons fall below comfortable touch size.
- The activity list exposes a dense strip of tiny controls on desktop and hides key actions on phones without an accessible alternative.
- Settings and add-activity forms use centered dialogs on phones and can occupy most of the screen while leaving the dashboard visible underneath.
- The screen hierarchy is weak: tiny mono labels, narrow timer numerals, many borders, and equal-weight cards make the primary action hard to find.
- Desktop has broad unused space in the sidebar while the main content remains small; the responsive layout does not scale typography or component density up well.
- The search empty state and other zero-data states need a stronger, more welcoming illustration and clear next action.

The before screenshots are in the sibling viewport folders.

## Iterative completion review

Captured and reviewed five responsive sizes (360×740, 390×844, 430×932, 768×1024, and 1440×900) across Today, Activities, timer running, Day, Week, Month, Year, Settings, the add-activity sheet, dark mode, and empty search.

- Round 4 exposed a real Year-view page overflow: the 53-week heatmap expanded the document to about 2,470px. The quick-add test also asserted a transient “saving” row after it had already been replaced by the persisted task.
- Round 5 isolated heatmap horizontal scrolling and observed the actual DOM insertion for quick-add latency. The phone review also found 40–42px targets in day controls and activity chips, and an undersized weekday picker.
- Round 6 contains the Year heatmap within its own scroll panel, enforces 44px touch targets and 16px form text, preserves safe-area space, waits for lazy views before capture, and checks page width for every captured state.

The final review found no page-level horizontal overflow, clipped content, or overlapping primary controls. The week matrix and year heatmap intentionally scroll horizontally within their own panels; truncated activity names expose their full labels on hover/focus.

Final screenshots are in `after/`; audit rounds are retained under `round-4/`, `round-5/`, and `round-6/`.

## Final quality pass

- Added a discoverable keyboard-shortcuts guide from `?`, the sidebar, and Preferences.
- The cross-browser quick-add measurement found Safari exceeded the 100ms target because submit redundantly refocused the already-focused input; removing that focus call brought iPhone 14/15 and Pixel 7 results below the threshold.
- The backup reminder’s actions fell short of the 44px touch target and now meet it.
- Re-captured all 10 states at each of the five requested viewport sizes (100 screenshots) and reviewed phone, tablet, and desktop results. Chromium, iPhone WebKit, and Pixel 7 E2E checks pass without page-level overflow.
- Mobile Lighthouse on the production build scores 91 performance, 95 accessibility, and 100 best-practices. The live clock now updates independently so idle clock ticks do not re-render the dashboard; initial-screen transitions use CSS and analytics-view motion stays lazy-loaded.
