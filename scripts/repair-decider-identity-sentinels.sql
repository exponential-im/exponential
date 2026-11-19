-- One-off repair for decider rows that stored a meeting participant's identity
-- sentinel instead of an email address.
--
-- Background: `TranscriptionSessionParticipant.email` is an identity key, not
-- always an address — a transcript-only speaker keys on `name:<lowercased>`
-- (see src/lib/meetings/participantIdentity.ts). Three call sites read that
-- column straight into a decider. The client path failed loudly on
-- `decision.create`'s email validation; the two server paths (the meeting
-- default in decisionService, and draft-decision generation) are past Zod and
-- wrote the sentinel to the database.
--
-- Deliberately NOT a Prisma migration: look before you write. Run step 1, read
-- the rows, then run step 2.
--
--   psql "$DATABASE_URL" -f scripts/repair-decider-identity-sentinels.sql
--
-- Step 2 is wrapped in a transaction that is ROLLED BACK by default — change
-- the final ROLLBACK to COMMIT once the counts look right.

-- ── Step 1: what is affected ────────────────────────────────────────────────
\echo '--- Deciders holding a name: sentinel as their email ---'
SELECT d."number" AS decision_number,
       dd.id      AS decider_id,
       dd.name    AS stored_name,
       dd.email   AS stored_email
FROM "DecisionDecider" dd
JOIN "Decision" d ON d.id = dd."decisionId"
WHERE dd.email LIKE 'name:%'
ORDER BY d."number", dd.name;

\echo '--- Counts ---'
SELECT count(*) FILTER (WHERE dd.email LIKE 'name:%')                        AS bad_emails,
       count(*) FILTER (WHERE dd.name  LIKE 'name:%')                        AS bad_names,
       count(DISTINCT dd."decisionId") FILTER (WHERE dd.email LIKE 'name:%') AS decisions_touched
FROM "DecisionDecider" dd;

-- ── Step 2: the repair ──────────────────────────────────────────────────────
BEGIN;

-- A sentinel is not an address. NULL is the honest value, and the column is
-- nullable; `@@unique([decisionId, email])` permits several NULLs per decision
-- because Postgres treats NULLs as distinct.
UPDATE "DecisionDecider"
SET email = NULL
WHERE email LIKE 'name:%';

-- Where the name column also took the sentinel (the old `name ?? email`
-- fallback), recover the name the key was built from. Only the case is lost;
-- the sentinel lowercases, so "Inès" comes back as "inès".
UPDATE "DecisionDecider"
SET name = NULLIF(substring(name FROM 6), '')
WHERE name LIKE 'name:%'
  AND NULLIF(substring(name FROM 6), '') IS NOT NULL;

-- Anything left with no recoverable name at all.
UPDATE "DecisionDecider"
SET name = 'Unknown'
WHERE name LIKE 'name:%' OR name = '';

\echo '--- Remaining sentinels (expect 0 / 0) ---'
SELECT count(*) FILTER (WHERE email LIKE 'name:%') AS bad_emails,
       count(*) FILTER (WHERE name  LIKE 'name:%') AS bad_names
FROM "DecisionDecider";

-- Change to COMMIT when the counts above read 0.
ROLLBACK;
