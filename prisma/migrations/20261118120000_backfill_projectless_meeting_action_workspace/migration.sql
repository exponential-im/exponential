-- An Action extracted from a Meeting with no Project was saved with no
-- Workspace: the extractor only copied the Project's workspace, never the
-- Meeting's. Those actions missed the workspace's views, and the Assign picker
-- had no workspace roster to offer for them. The extractor now falls back to
-- the Meeting's workspace; this brings the existing rows in line. Only
-- project-less actions with no workspace are touched; an action someone has
-- since filed in a project or a workspace keeps that placement.
--
-- Same guard as 20261007090000_backfill_meeting_workspace_from_project:
-- "Action"."transcriptionSessionId" comes from a migration directory with no
-- timestamp prefix, which applies after every timestamped one on a fresh
-- database. There the tables are empty and there is nothing to backfill.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Action' AND column_name = 'transcriptionSessionId'
  ) THEN
    UPDATE "Action" a
    SET "workspaceId" = s."workspaceId"
    FROM "TranscriptionSession" s
    WHERE a."transcriptionSessionId" = s."id"
      AND a."projectId" IS NULL
      AND a."workspaceId" IS NULL
      AND s."workspaceId" IS NOT NULL;
  END IF;
END $$;
