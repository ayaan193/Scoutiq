# ScoutIQ

Football scouting system built with Next.js, PostgreSQL, and pgvector. It follows the eight relations and Scout/Admin workflow in `ScoutIQ — DBMS Level 3 Project Report (1).docx`.

## Setup

1. Install PostgreSQL 16 and the pgvector extension on the server. Create a database: `CREATE DATABASE scoutiq;`.
2. Copy `.env.example` to `.env.local` and set `DATABASE_URL` and a long random `SESSION_SECRET`.
3. Run `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/scoutiq_database.txt` (in PowerShell, use `$env:DATABASE_URL` in place of `$DATABASE_URL`). The database file contains the complete DDL, seed clubs, and demonstration queries. Run it on an empty database.
4. Run `npm install`.
5. Set `DATABASE_URL` in your shell and create at least one account of each role: `node scripts/create-user.mjs admin <password> admin` and `node scripts/create-user.mjs scout <password> scout`.
6. Run `npm run dev` and open `http://localhost:3000`.

## Demo data

The schema file creates three starter clubs. To add a complete classroom dataset with at least ten rows in every table, run:

```powershell
$env:DATABASE_URL = 'postgresql://postgres:YOUR_PASSWORD@localhost:5432/scoutiq'
& 'C:\Program Files\PostgreSQL\15\bin\psql.exe' -U postgres -d scoutiq -v ON_ERROR_STOP=1 -v demo_password='CHOOSE_A_DEMO_PASSWORD' -f db\seed.sql
node scripts/embed-reports.mjs
```

The demo seed creates `demo_admin_1` and `demo_admin_2`, plus `demo_scout_1` through `demo_scout_8`, all using the password supplied in the command. The seed is safe to rerun without duplicating its records. The embedding command downloads the model on its first run.

The ten player identities, clubs, ages, broad positions, UEFA Champions League 2026/27 goals, assists and passing percentages were checked against the UEFA player pages on 30 October 2026. Each source URL is listed beside the seed queries in `db/seed.sql`. Specific positions, market values, preferred feet and dribbling ratings are **estimated demo values**. Reports, shortlists, recommendations, and accounts are synthetic demo records; they are not real scouting observations or transfer proposals. The seed varies ratings, dates, priorities, and recommendation outcomes to support the filters, dashboard, approval queue and audit queries. Pending recommendations intentionally have no deciding admin or decision timestamp; audit inserts intentionally have no old row.

The first semantic search or report save downloads the `Xenova/all-MiniLM-L6-v2` model. Reports are embedded on save; the text, 384-dimensional vectors, and an HNSW index remain in PostgreSQL. The model may take time to load the first time. Login credentials and database credentials are never committed.

## Database features

`db/scoutiq_database.txt` documents and implements all table types, keys, referential actions, checks, indexes, triggers, functions, views, seed queries, and demonstration operations. The SQL features include transactional player creation and recommendation approval, audit and validation triggers, views and window ranking, GIN full-text search, and HNSW cosine vector search. The API uses parameterized SQL and server-side role checks.

Player name search also uses PostgreSQL `pg_trgm` and `unaccent` for typo and accent tolerance. Both are enabled by the schema and by `db/seed.sql` for databases created before this feature. Rerunning the seed also repairs the three previously misencoded demo names.

## Verification

Run `npm run build` to check TypeScript and the production build. For the database demonstration, run the Q1–Q12 queries at the end of the database file after creating sample players and users. A report edit clears its vector in a trigger; the API recomputes it before committing. Approval updates the recommendation and shortlist in one transaction.

The source report supplies the ER diagram, relational schema, objectives, functional requirements, and data dictionary. Application screenshots and live test results should be captured after connecting a local PostgreSQL instance.
