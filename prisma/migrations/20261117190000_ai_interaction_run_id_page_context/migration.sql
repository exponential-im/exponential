-- What an admin needs to diagnose a low-rated agent reply (bronze.tide):
-- the Mastra run the turn belongs to, and the kind of page the chat was on.
-- Both nullable, no backfill: older rows simply have neither.
ALTER TABLE "AiInteractionHistory" ADD COLUMN "mastraRunId" TEXT;
ALTER TABLE "AiInteractionHistory" ADD COLUMN "pageContextType" TEXT;
