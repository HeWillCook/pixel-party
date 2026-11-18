# PR 2: Drawing tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** White paint, eraser and colour picker in Daily and Party; flood fill and undo/redo in Daily only; Party erase obeys the cooldown and lowers pixels used.

**Architecture:** The tool logic is pure (`src/game/tools.ts`, `src/game/history.ts`). `PixelCanvas` learns a `tool` prop and reports intents, and a new labelled `ToolBar` component selects tools. On the Party server, colour 0 becomes a legal placement, and erasing an empty cell is a silent no-op that doesn't consume cooldown. Cells stay base64 bytes, so index 16 needs only bound changes.

**Tech Stack:** TypeScript, React, DeepSpace SDK (Durable Objects), Vitest, Playwright (offline suite).

**Spec:** `docs/superpowers/specs/2026-11-17-porch-redesign-design.md` (section "Drawing tools").

## Global Constraints

- Follow `AGENTS.md`: no deploy, push, undeploy, transfer or collaborator commands; no secrets; no real AI calls.
- `npm ci` if `node_modules` is missing. `npm run verify` must pass; offline Playwright may be updated where it asserts the old palette, keeping existing `data-testid`s.
- Judge rendering must not change: `png.ts` keeps `PALETTE[0] = '#ffffff'`, and white paint (index 16) is also `#ffffff`.
- No keyboard-shortcut text anywhere in the UI. Shortcuts (B paint, E erase, F fill, I pick, ⌘/Ctrl+Z undo, ⇧⌘/Ctrl+Shift+Z redo) work but aren't displayed.
- Fill and undo/redo are never rendered in Party.
- The styling isn't final (PR 3 restyles). Use the current look.
- **Coordination with PR 1:** PR 1 rewrites `src/hooks/useDailyAttempt.ts` and `src/pages/(app)/home.tsx`. Tasks 1–4 don't touch those files. Task 5 does: start it only after PR 1 has merged into `main`, and rebase onto `main` first.

## Review Focus

1. A fill on a 32×32 canvas that's all one colour (1024 cells) must finish instantly and record a single undo step. Covered by Task 2's `fill whole canvas` and Task 5's `one fill is one undo step`.
2. A drag stroke must be one undo step, not one per cell. Covered by Task 5's `drag stroke is one undo step`.
3. In Party, erasing during cooldown is rejected with `cooldown` like painting, but erasing an already-empty cell during cooldown is silently ignored (no reject toast). Covered by Task 4's tests.
4. Old Daily drawings and localStorage snapshots (indices 0–15) must still decode and render after the bound change. Covered by Task 1's `legacy cells still valid`.
5. Picking an empty cell selects the eraser (empty isn't a paint colour), rather than painting colour 0 with the paint tool. Covered by Task 2's `pick empty returns erase`.

---

### Task 1: White paint, colour bounds and canvas look

**Files:**
- Modify: `src/game/config.ts:1-18` (PALETTE gains index 16 `'#ffffff'`, comment "white paint"; add `export const MAX_COLOR = PALETTE.length - 1` and `export const EMPTY_CANVAS = ['#f3ead8', '#efe3cc'] as const`)
- Modify the bounds so they use `MAX_COLOR` / `PALETTE.length`: `src/server/daily-service.ts:75`, `src/hooks/useDailyAttempt.ts:38,:58`, `src/pages/(app)/home.tsx:55`, `src/server/pixel-room.ts:60` (already length-based; leave it)
- Modify: `src/components/game/PixelCanvas.tsx:49-64` and `src/components/daily/PixelThumb.tsx:14`, so empty (0) cells draw as a cream weave: `EMPTY_CANVAS[(x + y) % 2]`
- Modify: `src/components/game/Palette.tsx` (swatch order `[16, 1, 2, …, 15]`; name 16 `'White'`)
- Test: `src/game/grid.test.ts`, `src/game/png.test.ts`, `src/server/daily-service.test.ts`

> `home.tsx:55` and `useDailyAttempt.ts` are PR 1 files, but this change is a one-token bound swap per line. Do it here and resolve the trivial conflict at merge.

- [ ] **Step 1: Write the failing tests:**
  - `white paint is accepted by daily validation`: cells containing 16 → valid.
  - `legacy cells still valid`: cells using only 0–15 → valid and decode identically.
  - `png renders 0 and 16 as white`: pixel RGB is `255,255,255` for both.
  - `17 is rejected`.
- [ ] **Step 2: Run** `npm run test:unit -- src/game/grid.test.ts src/game/png.test.ts src/server/daily-service.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run test:unit`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(palette): add white paint and cream empty canvas`.

### Task 2: Pure tool logic and history

**Files:**
- Create: `src/game/tools.ts`, `src/game/history.ts`
- Test: `src/game/tools.test.ts`, `src/game/history.test.ts`

**Interfaces (produced):**
```ts
// tools.ts
export type Tool = 'paint' | 'erase' | 'fill' | 'pick'
export const DAILY_TOOLS: readonly Tool[] = ['paint', 'erase', 'fill', 'pick']
export const PARTY_TOOLS: readonly Tool[] = ['paint', 'erase', 'pick']
export function floodFill(cells: Uint8Array, width: number, height: number, x: number, y: number, color: number): Uint8Array // new array; 4-connected; same-colour region incl. empty; returns the input unchanged (same reference) if the target colour === color
export function pickAt(cells: Uint8Array, width: number, x: number, y: number): { tool: 'paint'; color: number } | { tool: 'erase' }
// history.ts
export interface History { past: Uint8Array[]; future: Uint8Array[] }
export const HISTORY_LIMIT = 100
export function emptyHistory(): History
export function record(h: History, before: Uint8Array): History   // pushes before, clears future, caps at HISTORY_LIMIT (drop oldest)
export function undo(h: History, current: Uint8Array): { history: History; cells: Uint8Array } | null
export function redo(h: History, current: Uint8Array): { history: History; cells: Uint8Array } | null
```
`floodFill` must be iterative (an explicit stack), not recursive.

- [ ] **Step 1: Write the failing tests:**
  - `fill bounded region`: a 4×4 grid with a closed square of colour 1 → filling inside changes only the interior.
  - `fill whole canvas`: a 32×32 all-0 grid filled with 5 → all 1024 cells are 5, and it completes in under 50 ms.
  - `fill same colour is identity`: returns the same reference.
  - `fill is 4-connected`: diagonal neighbours aren't filled.
  - `pick paint colour`: returns `{tool:'paint', color}`.
  - `pick empty returns erase`.
  - `undo then redo restores`; `record clears future`; `history caps at 100`.
- [ ] **Step 2: Run** `npm run test:unit -- src/game/tools.test.ts src/game/history.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(tools): flood fill, picker and undo history`.

### Task 3: Canvas tool support and ToolBar

**Files:**
- Modify: `src/components/game/PixelCanvas.tsx` (props at :6-19, pointer handlers at :80-93)
- Create: `src/components/game/ToolBar.tsx`, `src/hooks/useToolShortcuts.ts`
- Test: `tests/offline/pixel.spec.ts` (or a unit test of a pure `canvasIntent()` helper if that's simpler)

**Interfaces:**
- Consumes: `Tool` (Task 2).
- `PixelCanvas` gains optional props: `tool?: Tool` (default `'paint'`), `onFill?(x, y)`, `onPick?(x, y)`, `onStrokeStart?()`, `onStrokeEnd?()`. Behaviour:
  - **paint:** as today, with `onPlace(x, y, activeColor)`.
  - **erase:** the same stroke path, with `onPlace(x, y, 0)`.
  - **fill:** a single `onFill` on pointer-down; no drag.
  - **pick:** a single `onPick` on pointer-down.
  - `onStrokeStart` and `onStrokeEnd` wrap each paint or erase drag.
  - Fill and pick must respect `canDraw`. For paint and erase, first read `handlePlace` in `src/pages/(app)/r/[code].tsx` and the `tests/offline/pixel.spec.ts` assertions: if clicks while unable to draw are what trigger the sign-in and cooldown notices, keep that behaviour for paint and erase and gate only fill and pick.
  - The hover preview shows the cream colour for erase.
- `ToolBar({ tools, active, onSelect, onUndo?, onRedo?, canUndo?, canRedo?, disabled? })`: a vertical list of buttons, each with an icon and label (`Paint`, `Erase`, `Fill`, `Pick colour`, `Undo`, `Redo`), `aria-pressed` on the active tool, and `data-testid="tool-<name>"`. Undo and Redo render only when their handlers are given. No shortcut text.
- `useToolShortcuts({ tools, onSelect, onUndo?, onRedo?, enabled })`: keydown listener; ignores events from inputs and textareas.

- [ ] **Step 1: Write the failing test(s):** `erase tool sends color 0`, `fill tool sends single fill intent`, `canDraw=false places nothing`.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** them. Expected: PASS.
- [ ] **Step 5: Commit** `feat(canvas): tool-aware canvas and labelled toolbar`.

### Task 4: Party erase rules and wiring

**Files:**
- Modify: `src/game/rules.ts:46` (accept `0 <= color <= MAX_COLOR`), `src/game/room-logic.ts:67` `applyPlacement` (if `c === 0` and the cell is already 0: return the state unchanged with no events and no `lastPlacedAt` bump, checked before the cooldown validation), `src/hooks/usePixelRoom.ts:233` (accept 0; the existing `cells[idx] === c` skip already makes empty erases free on the client)
- Modify: `src/pages/(app)/r/[code].tsx` (`ToolBar` with `PARTY_TOOLS`, local `tool` state, `onPick` → set the colour or switch to erase; pass `tool` to `PixelCanvas`)
- Test: `src/game/rules.test.ts`, `src/game/room-logic.test.ts`, `src/server/pixel-room.test.ts`

- [ ] **Step 1: Write the failing tests:**
  - `erase clears a pixel and credit`: after erasing, the cell is 0, `placedBy` is `''`, and an event `{type:'pixel', c:0}` is emitted.
  - `erase lowers pixels used at round end`: paint 3 cells, erase 1, end the round → `pixelsUsed === 2`.
  - `erasing empty is a free no-op`: no events, `lastPlacedAt` unchanged, and an immediate paint isn't cooldown-rejected.
  - `erase during cooldown is rejected` with `cooldown`.
  - `white 16 accepted; 17 rejected` (`bad_color`).
- [ ] **Step 2: Run** `npm run test:unit -- src/game/rules.test.ts src/game/room-logic.test.ts src/server/pixel-room.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm run test:unit`. Expected: PASS. Then run `npm run build && npx playwright test tests/offline/pixel.spec.ts`, adding a case for "room shows Paint, Erase and Pick colour; no Fill, Undo or Redo". Expected: PASS.
- [ ] **Step 5: Commit** `feat(party): eraser and picker with cooldown rules`.

### Task 5: Daily wiring (after PR 1 merges)

**Files:**
- Modify: `src/hooks/useDailyAttempt.ts` (add `replaceCells(next: Uint8Array): void`, gated like `paint` and persisted the same way), `src/pages/(app)/home.tsx` (playing view: `ToolBar` with `DAILY_TOOLS` plus undo/redo; history state via `record`/`undo`/`redo`; `useToolShortcuts`)
- Test: `tests/offline/daily.spec.ts`

**Interfaces:**
- Consumes: Tasks 2–3, and PR 1's `useDaily()` context.
- History lives in `home.tsx` state (in memory; a reload starts empty):
  - `onStrokeStart` → `record(h, cellsBefore)`
  - fill → `record` then `replaceCells(floodFill(…))`, skipped if `floodFill` returned the same reference
  - undo/redo → `replaceCells(result.cells)`

- [ ] **Step 1: Rebase** onto `main` (with PR 1 merged). Run `npm run verify`. Expected: PASS before changes.
- [ ] **Step 2: Write the failing offline tests:**
  - `one fill is one undo step`: fill the canvas, undo → blank.
  - `drag stroke is one undo step`: drag across 5 cells, undo → all 5 cleared.
  - `redo restores`.
  - `pick switches colour`.
  - `eraser clears`.
- [ ] **Step 3: Run** `npm run build && npx playwright test tests/offline/daily.spec.ts`. Expected: FAIL.
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run** the same command, then `npm run verify`. Expected: PASS.
- [ ] **Step 6:** Append a dated entry to `docs/progress.md`. Commit `feat(daily): fill, eraser, picker and undo/redo`.
