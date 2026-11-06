
ADDIS EGATA BOT
================

Project
-------
Telegram bot: @Addis_draw_bot
Platform: Cloudflare Workers
Database: Cloudflare D1
Worker URL:
https://addis-egata-bot-api.satsaturn686.workers.dev

IMPORTANT SAFETY RULE
--------------------
This project is being prepared on the
cloudflare-bot-staging branch.

Do not deploy to production until:
1. All source files are reviewed together.
2. All database migrations are tested.
3. Payment and wallet operations are verified.
4. Telegram webhook security is verified.
5. Draw fairness and winner selection are tested.
6. User and admin workflows are tested.

Never expose bot tokens, API keys, passwords,
or other secrets in source code or screenshots.

Project Structure
-----------------
cloudflare/worker/
  README.txt
  package.json
  wrangler.jsonc
  migrations/
    0001_initial.sql
    0002_payment_safety.sql
    0003_workflow_safety.sql
  src/
    index.js

Database
--------
D1 database name: addis-egata-db
Binding name: DB

The database must be migrated before the Worker
is connected to real users.

Commands
--------
Install dependencies:

npm install

Run local development:

npm run dev

Apply migrations locally:

npm run db:migrate:local

Apply migrations remotely:

npm run db:migrate:remote

Deploy Worker:

npm run deploy

Important:
Do not run remote migrations or deploy until
the complete source has been reviewed and tested.

Payment Rules
-------------
Payment method: Telebirr
Timezone: Africa/Addis_Ababa
Payment service hours: 03:00–12:00 Ethiopia time

Telebirr payments are manually verified unless
a real, authorized payment API integration
has been implemented and tested.

Security Requirements
---------------------
- Verify Telegram webhook secret.
- Validate Telegram user identity.
- Restrict admin commands to authorized admins.
- Prevent duplicate Telegram update processing.
- Prevent duplicate payment references.
- Prevent duplicate number reservations.
- Record wallet transactions with unique references.
- Keep audit records for important admin actions.
- Never trust payment screenshots as proof of payment
  without manual verification.
- Never publish a draw result before verification.

Operational Rules
-----------------
- Keep the existing Mini App and Render services
  untouched.
- Work only on the cloudflare-bot-staging branch.
- Do not use the production database.
- Do not share secrets in GitHub commits.
- Do not announce the bot as ready until all
  required workflows have passed testing.

Status
------
Development and verification required.
Not approved for production deployment yet.
