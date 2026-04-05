> **Warning**
> This project is under active development and not yet ready for production use.

# Guidebook

Guidebook is a markdown-based wiki service for the Convention platform. It provides a collaborative knowledge base where staff can create, edit, and organize pages with full revision history and wiki-style cross-references.

## What it does

- **Markdown pages** — Create and edit content in Markdown, rendered beautifully in the Dashboard
- **Wiki links** — Reference other pages with `[[Page Name]]` or `[[Page Name|Custom Text]]` syntax, resolved server-side
- **Revision history** — Every edit is tracked with full content snapshots
- **Page hierarchy** — Pages can have parent pages for logical organization
- **Department access control** — Restrict pages to specific departments (coming soon)
- **Search** — Full-text search across all pages (coming soon)

## Architecture

Guidebook is a backend-only REST API — it has no UI of its own. The Dashboard renders all Guidebook UI dynamically from its JSON manifest. Guidebook registers itself with Lanyard's service catalog on boot.

```
Browser → Dashboard (UI) → API Proxy → Guidebook (REST API + PostgreSQL)
                                     → Lanyard (Auth + Service Catalog)
```

## Tech Stack

- **Runtime:** Bun
- **Framework:** TanStack React Start (for API route handling)
- **Database:** PostgreSQL via Drizzle ORM
- **Linting:** Biome

## Getting Started

### Prerequisites

- Bun installed
- PostgreSQL database
- Lanyard running (for authentication and service registration)
- Dashboard running (for the UI)

### 1. Install dependencies

```bash
bun install
```

### 2. Set up environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
DATABASE_URL=postgres://guidebook:guidebook@localhost:5432/guidebook
LANYARD_URL=http://localhost:3000
LANYARD_SERVICE_KEY=sk_svc_your_key_here
PORT=5000
```

### 3. Run migrations

```bash
bun run db:migrate
```

### 4. Register with Lanyard

Before the Guidebook can appear in the Dashboard, it needs to be registered as a service in Lanyard. You can do this through the Dashboard's admin panel:

1. Sign in to Dashboard as an admin
2. Go to **Lanyard Admin → Services → Register Service**
3. Fill in:
   - **Name:** Guidebook
   - **Slug:** `guidebook`
   - **Type:** Service
   - **Base URL:** `http://localhost:5000` (or wherever Guidebook runs)
   - **Health Check Path:** `/api/health`
   - **Visibility:** Staff Only
4. Click **Register Service**
5. **Copy the API key** (`sk_svc_...`) — you'll need it for the `.env`

Set the API key in your `.env`:

```env
LANYARD_SERVICE_KEY=sk_svc_your_copied_key_here
```

### 5. Start the dev server

```bash
bun run dev
```

Guidebook will:

- Start on port 5000
- Send a heartbeat to Lanyard with its UI manifest
- Appear in the Dashboard sidebar as "Guidebook" (for staff and admins)

### 6. Create your first page

1. In the Dashboard, click **Guidebook** in the sidebar
2. Click **New Page**
3. Write some markdown and give it a title
4. Click **Create Page**

## Scripts

| Script | Description |
|---|---|
| `bun run dev` | Start dev server (port 5000) |
| `bun run build` | Production build |
| `bun run start` | Start production server |
| `bun run db:generate` | Generate migration files |
| `bun run db:migrate` | Run migrations |
| `bun run typecheck` | TypeScript type checking |
| `bun run lint` | Biome linting |

## Wiki Link Syntax

Reference other pages in your markdown:

```markdown
See [[Getting Started]] for more info.
Check the [[Network Setup|networking guide]] for details.
```

- `[[Page Name]]` — links to the page by title
- `[[Page Name|Display Text]]` — links with custom display text
- Broken links (page doesn't exist) are rendered with a visual indicator

## API Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/pages` | GET | List all pages (data-table format) |
| `/api/pages` | POST | Create a new page |
| `/api/pages/:slug` | GET | Read page content (markdown format) |
| `/api/pages/:slug` | PUT | Update page (saves revision) |
| `/api/pages/:slug` | DELETE | Delete page (admin only) |
| `/api/pages/:slug/history` | GET | Revision history |
| `/api/pages/:slug/revisions/:id` | GET | View specific revision |
| `/api/health` | GET | Health check |

---

Made and maintained with 🧡 by [Headpat](https://headpat.space)
