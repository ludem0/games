# games — CLAUDE.md

## Stack

- **Next.js 15** (App Router), **React 18**, **TypeScript 5**
- No external UI libraries — pure CSS Modules + native SVG
- **Runtime storage**: flat JSON files (`users.json`, `seasons.json`, `minigames.json`) on the server filesystem
- **Auth**: JWT in `session` cookie; middleware protects all routes except `/login`
- **Deploy**: Docker Compose — `app` (Next.js) + `nginx` reverse proxy

```
docker compose up -d --build app   # rebuild app only
```

## Repo layout

```
games/
├── app/                        Next.js application
│   ├── src/
│   │   ├── app/
│   │   │   ├── (app)/          Authenticated pages
│   │   │   │   ├── page.tsx                Main dashboard
│   │   │   │   ├── admin/                  Admin panel
│   │   │   │   ├── seasons/[slug]/         Season detail
│   │   │   │   ├── stats/                  Stats page
│   │   │   │   ├── profile/                Profile
│   │   │   │   └── minigames/[slug]/       ← ACTIVE minigame route (dynamic slug)
│   │   │   ├── api/            REST API routes
│   │   │   │   ├── auth/       login / logout
│   │   │   │   ├── minigames/[slug]/       CRUD + round lifecycle
│   │   │   │   └── seasons/[slug]/         Season data
│   │   │   └── login/
│   │   ├── lib/
│   │   │   ├── minigames.ts        Data model + file I/O (minigames.json)
│   │   │   ├── trackTroubleLayouts.ts  9 reference layouts for Track Trouble
│   │   │   ├── seasons.ts          Season data model
│   │   │   ├── types.ts            User / Role / SessionPayload
│   │   │   ├── auth.ts             verifyToken helper
│   │   │   └── jwt.ts              JWT sign/verify (jose)
│   │   ├── components/         Shared UI components (CubeGambit etc.)
│   │   └── middleware.ts       Auth guard (allows /login, /api/auth)
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
├── nginx.conf
├── users.json                  Persisted users (mounted as volume)
├── seasons.json                Persisted seasons
└── minigames.json              Persisted minigames (starts as {})
```

> **Note**: `app/src/app/(app)/minigames/track_trouble/` is a legacy folder with
> old component copies. The **active** route is `[slug]/`. Do not edit
> `track_trouble/` — it is not served (no `page.tsx`).

## Minigame: Track Trouble (`slug = "track_trouble"`)

### Data model (`lib/minigames.ts`)

```
MinigameData
  id, name, status, participants, rounds, totalPoints, psigemBalance, peeks

MinecartRound
  roundNumber, layout: RoundLayout, phase, phaseDeadline,
  submissions, results, availableChainsForCrossing2

RoundLayout
  tracks: Track[]
  switches: TrackSwitch[]
  peekUnlocked: boolean

Track
  id, chains: MinecartChain[], isGreyed, isFloating?
  isFloating = true → destination-only path (no starting wagons, no bottom letter)

MinecartChain
  id, capacity, points, departsTo: 'north'|'south'
  capacity = 0 on floating tracks (only top destination box renders, no wagons)

TrackSwitch
  id, color, side: 'north'|'south', swapsTrackIds[], anchorTrackId?
  crossing? = true → X-cross style (node per track, arms cross)
             = false/omit → fork style (single node, arms fan out)
```

### Renderer (`[slug]/VisualLayoutViewer.tsx`)

Pure SVG, 620×620 viewport. Key constants at top of file:
`W=620 H=620 TRACK_TOP=78 RAVINE_Y=520 TRACK_BOTTOM=560 LETTER_Y=588`
`WAGON_W=46 WAGON_H=34 NODE_R=13 FORK_H=70`

**Track lines**
- Normal tracks: TRACK_TOP → TRACK_BOTTOM
- X-crossing tracks: from switch node Y → TRACK_BOTTOM (top replaced by crossing arms)
- Floating tracks: TRACK_TOP → arm endpoint of the switch that connects to them (no line below)

**Bottom labels (A, B, C…)**
- Sequential counter over non-floating tracks only
- Floating tracks are skipped — gap appears at their column position

**Switches**
- `crossing=true`: two nodes (one per track), grey vertical arms + colored crossing arms, track line starts at node
- `crossing=false` (fork): single node on anchor track, colored arm = anchor, grey arms = others

**Levers**
- One orange lever token per `(color, side)` group — single lever controls all switches of that color on that side
- Positioned at centroid x of all tracks in the group

### Seed layouts (`lib/trackTroubleLayouts.ts`)

`getDefaultRoundLayouts()` returns 9 `RoundLayout` objects (R1–R9).

Helper signatures:
```typescript
function round(r, tracks: {points, cap, grey?, floating?}[], switches: {color, side, tracks[], anchor, cross?}[])
```

**R1 layout** (reference-verified):
- A(4pts,3w) B(3pts,3w) C(2pts,3w) [floating→5pts,0w] D(2pts,2w) E(3pts,1w)
- Two purple south switches: A↔B (anchorA), C↔floating (anchorC)
- Single purple lever at centroid of all 4 involved tracks

**R2, R4**: purple north X-crossings (`cross: true`)
**R5**: pink south 3-way star fork
**R6, R9**: purple + pink + cyan south forks (three colored levers)
**R7**: multi-arm purple + cyan south forks
**R8**: 5-way purple north staircase fork

### Seeding / resetting layouts

Admin button **"📥 Загрузить эталонные макеты"** → `POST /api/minigames/[slug]/seed`
Calls `getDefaultRoundLayouts()` and overwrites layouts on all pending rounds.

### Round lifecycle

```
pending → crossing1_open → crossing2_open → complete
```

Admin controls phase via `POST /api/minigames/[slug]/rounds/[n]/open`.
Players submit via `POST /api/minigames/[slug]/rounds/[n]/submit`.
Admin resolves via `POST /api/minigames/[slug]/rounds/[n]/resolve`.

### Psigems

Every 10 points earned = 1 Ψ (psigem). Computed in `computePsigemGrants()`.

## Development workflow

```bash
cd app
npm run dev       # dev server on :3000
npx tsc --noEmit  # type-check (always run before committing)
```

Middleware bypass: add `|| pathname.startsWith('/your-route')` in `middleware.ts` for dev-only pages, revert before commit.

## Commit conventions

```
feat: short description
fix: short description
refactor: short description
```

No Co-Authored-By unless requested.

## JSON storage notes

- `minigames.json` starts as `{}` — populated when admin creates a game
- Mounted as Docker volume: changes persist across container rebuilds
- Format: `Record<slug, MinigameData>`
