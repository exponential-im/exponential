-- Retire the public bounty board (Nov 2026). Drops everything added by
-- 20260222190512_add_bounty_and_wallet_fields and
-- 20260223134555_add_enable_bounties_setting, including the Wallet table and
-- the User contributor fields (no code reads either).
--
-- Destructive: bounty settings, claims, per-action bounty data, wallets and
-- contributor profile fields are deleted.

-- DropTable (their FKs and indexes go with them)
DROP TABLE "public"."BountyClaim";
DROP TABLE "public"."Wallet";

-- DropIndex
DROP INDEX "public"."Action_isBounty_idx";
DROP INDEX "public"."Action_bountyStatus_idx";

-- AlterTable
ALTER TABLE "public"."Action" DROP COLUMN "bountyAmount",
DROP COLUMN "bountyDeadline",
DROP COLUMN "bountyDifficulty",
DROP COLUMN "bountyExternalUrl",
DROP COLUMN "bountyMaxClaimants",
DROP COLUMN "bountySkills",
DROP COLUMN "bountyStatus",
DROP COLUMN "bountyToken",
DROP COLUMN "isBounty";

ALTER TABLE "public"."Project" DROP COLUMN "enableBounties";
ALTER TABLE "public"."Workspace" DROP COLUMN "enableBounties";
ALTER TABLE "public"."User" DROP COLUMN "bio",
DROP COLUMN "contributorSkills",
DROP COLUMN "displayName",
DROP COLUMN "isContributor";

-- DropEnum
DROP TYPE "public"."BountyStatus";
DROP TYPE "public"."ClaimStatus";
