# CLAUDE.md — Mother's Day Guess-Mom Game

This is the operating manual for any agent (Claude or subagent) working in this repo. Read it before doing anything.

## What this project is

A static, single-page web game. The user is shown a text message one at a time and guesses **"Mom said it"** or **"Not Mom"**. After N rounds a final score screen plays an animated reaction keyed to the score (flowers for great, 💩 for terrible).

It is a one-time gift for Mother's Day 2026-05-10. It must:
- Cost $0 to host and run
- Deploy as static files to GitHub Pages
- Run on a phone (most family will play on mobile)
- Handle bilingual text (English + Simplified Chinese, often mixed in one message)
- Never include uncurated private texts — every shipped text has been hand-approved

## Source-of-truth files

These three files are the canonical project state. Read at session start, append to as you learn things, keep them current:

- [PLANNING.md](PLANNING.md) — the incremental plan, key decisions, open questions
- [PROGRESS.md](PROGRESS.md) — status log: what's done, in-flight, blocked
- [CLAUDE.md](CLAUDE.md) — this file: conventions and constraints that don't change often

If you make a non-trivial decision, record it in PLANNING.md. If you finish or block on a step, log it in PROGRESS.md. Subagents must read PLANNING.md and PROGRESS.md at start, append findings at end.

## Tech stack (locked)

- **HTML/CSS/JS only**, no build step, no npm
- **Tailwind via CDN** (`<script src="https://cdn.tailwindcss.com"></script>`) for styling
- **canvas-confetti via CDN** for particle effects (flowers, 💩, hearts)
- **No frameworks**, **no bundlers**, **no backend**
- Deploy = `git push` to a GitHub Pages branch. That's it.

If you're tempted to add a dependency, don't. If you genuinely need one, add it via CDN `<script>` and document why in PLANNING.md.

## File layout

```
mothers_day_webpage/
├── CLAUDE.md           ← you are here
├── PLANNING.md         ← living plan
├── PROGRESS.md         ← status log
├── README.md           ← (only at end, for the family)
├── src/
│   ├── index.html      ← the entire app shell
│   ├── style.css       ← custom styles beyond Tailwind
│   ├── app.js          ← game logic
│   └── texts.js        ← curated text bank (the only file holding mom's words)
├── data/
│   ├── raw_mom.json    ← SQL output, UNCURATED — never ship
│   ├── raw_others.json ← SQL output, UNCURATED — never ship
│   └── curated.json    ← user-approved final set, source for texts.js
└── scripts/
    └── extract_messages.sh  ← SQL extraction from chat.db
```

`data/raw_*.json` and any uncurated dump **must** be gitignored. `data/curated.json` is what gets imported into the app.

## Code conventions

**HTML**
- Semantic elements (`<main>`, `<section>`, `<button>`, not `<div onclick>`)
- `<html lang="en">` on root; if a text element is purely Chinese, set `lang="zh-Hans"` on it
- Mobile-first viewport: `<meta name="viewport" content="width=device-width, initial-scale=1">`

**CSS / Tailwind**
- Mobile-first. Design for 375px width, scale up.
- Font stack must include CJK fallbacks: `system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif`
- Respect `prefers-reduced-motion`: gate every non-essential animation behind a `@media (prefers-reduced-motion: no-preference)` block
- Min tap target 44×44px (Apple HIG)
- Color contrast WCAG AA (4.5:1 for body text)

**JS**
- Vanilla ES modules (`<script type="module" src="app.js">`)
- No `var`, prefer `const`, `let` only when reassigning
- Game state lives in one plain object, not scattered globals
- Pure functions for scoring/round logic; DOM updates separated from logic
- No `eval`, no `innerHTML` with user-controlled strings (XSS — use `textContent`)

**Animation**
- Shake-on-wrong: CSS keyframes, ~400ms, gated on reduced-motion
- Final-screen particle effects: `canvas-confetti` with custom emoji shapes
- Use `requestAnimationFrame` for any hand-rolled animation, never `setInterval`

## Design principles

Avoid generic AI-generated aesthetics: overused fonts (Inter, Roboto, Arial, system fonts), clichéd color schemes (especially purple gradients on white or dark backgrounds), predictable layouts, cookie-cutter components. Make distinctive, context-specific choices. Pick one decisive font and use it confidently. Commit to a cohesive aesthetic with dominant colors and sharp accents rather than timid evenly-distributed palettes.

Practical tells of the generic-AI look — flag and avoid:
- System font stacks as the *intended* primary type (system fallbacks are fine for CJK or for offline reliability, but the site's voice should come from a deliberate display/text face, not from `-apple-system`)
- Tailwind-default `bg-rose-500 / rounded-full / px-8 py-4 / text-lg font-semibold` button — recognisable on sight as "AI built this"
- Glassmorphism-as-default (`backdrop-blur-md` on every card)
- Soft pastel gradient backgrounds spread across 3+ stops (pink → rose → amber, blue → indigo → purple)
- Centered `max-w-md flex flex-col gap-4` column layout with no asymmetry, no decoration, no rotation, no off-grid elements
- Five colors at equal saturation. One *dominant* color + one *sharp* accent reads as intentional; five-color palettes read as Figma defaults.

When the design looks generic, it's almost always one of those. Pick a face, commit to a palette, and let the layout breathe asymmetrically.

## Privacy rules (non-negotiable)

1. Real texts from `chat.db` go into `data/raw_*.json` — these files are gitignored and never leave the user's machine
2. Only `data/curated.json` (texts the user has personally approved) gets imported into the app
3. `texts.js` (the shipped bank) is reviewed by the user before any deploy
4. Mom's identifiers (phone, emails) live in PLANNING.md and the SQL script; do not hardcode them in shipped JS
5. If a candidate text contains anything sensitive (medical, financial, names of people outside immediate family, anything embarrassing), it does not ship — flag it for the user to decide

## Multi-agent coordination

When spawning subagents:
- Hand them a self-contained brief (they don't see the conversation)
- Tell them to read PLANNING.md and PROGRESS.md first
- Tell them to append their findings to PROGRESS.md before returning
- Independent work → spawn in parallel (one message, multiple Agent calls)
- Dependent work → sequential

## Testing

This is a 3-day project, so testing is manual + targeted:
- Open `src/index.html` directly in a browser (no server needed for the game itself)
- Test on iOS Safari (most family devices) and one desktop browser
- Verify: shake on wrong, score progression, final-screen branches at 0%, 50%, 100%, Chinese text renders, reduced-motion path works
- Lighthouse mobile score should be ≥90 on Performance and Accessibility before shipping

## Deployment

GitHub Pages, branch deploy:
1. `git init` (not yet done — this dir is not a repo)
2. Push to a public repo (or private with GH Pages enabled)
3. Settings → Pages → deploy from `/src` folder or root
4. Share the URL with family

Do NOT push `data/raw_*.json` or `data/curated.json`. The shipped artifact is `src/` only.
