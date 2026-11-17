import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { Prisma } from "@prisma/client";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { getEmbeddingService } from "~/server/services/EmbeddingService";
import { isLowRating, LOW_RATING_REASON_IDS } from "~/lib/feedback/lowRating";
import { agentErrorTraceContext } from "~/server/services/ai/providerError";
import {
  findFaultTickets,
  notifyLowRating,
  parseToolTrace,
  readReasons,
} from "~/server/services/feedback/lowRatingAlert";
import { runAfterResponse } from "~/server/utils/runAfterResponse";

// The trace of a turn is another person's conversation plus raw tool error
// text. Admins only, checked here and not just by the /admin layout.
const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (!ctx.session.user.isAdmin) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next();
});

function metadataObject(metadata: unknown): Record<string, unknown> {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {};
}

export const feedbackRouter = createTRPCRouter({
  submitCalendarFeedback: protectedProcedure
    .input(z.object({
      feature: z.string(),
      rating: z.number().min(1).max(5),
      feedback: z.string().min(1).max(1000),
      metadata: z.object({
        userAgent: z.string().optional(),
        timestamp: z.string().optional(),
      }).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Create feedback entry in database
      const feedbackEntry = await ctx.db.feedback.create({
        data: {
          userId: ctx.session.user.id,
          feature: input.feature,
          rating: input.rating,
          content: input.feedback,
          metadata: input.metadata as any,
        },
      });

      // Log feedback for monitoring
      console.log(`[FEEDBACK] User ${ctx.session.user.email} submitted ${input.rating}/5 rating for ${input.feature}`);

      return {
        success: true,
        id: feedbackEntry.id,
      };
    }),

  getFeatureFeedback: protectedProcedure
    .input(z.object({
      feature: z.string(),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ input, ctx }) => {
      const feedback = await ctx.db.feedback.findMany({
        where: {
          feature: input.feature,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: input.limit,
        include: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      });

      return feedback;
    }),

  getAverageRating: protectedProcedure
    .input(z.object({
      feature: z.string(),
    }))
    .query(async ({ input, ctx }) => {
      const aggregation = await ctx.db.feedback.aggregate({
        where: {
          feature: input.feature,
        },
        _avg: {
          rating: true,
        },
        _count: {
          rating: true,
        },
      });

      return {
        averageRating: aggregation._avg.rating || 0,
        totalFeedback: aggregation._count.rating,
      };
    }),

  /**
   * Rate an AI agent response.
   *
   * One rating per person per reply: a second call updates the first, which
   * is how the one-tap reasons and the note arrive after a thumbs-down (the
   * rating is sent the moment the stars are tapped, so it is not lost when
   * the person stops there).
   *
   * A low rating (1 or 2) is posted to the ops room once, with a link to the
   * admin trace view. No ticket is filed: see `lowRatingAlert`.
   */
  submitAgentFeedback: protectedProcedure
    .input(
      z.object({
        aiInteractionId: z.string(),
        rating: z.number().int().min(1).max(5),
        comment: z.string().max(2000).optional(),
        improvementSuggestion: z.string().max(2000).optional(),
        reasons: z.array(z.enum(LOW_RATING_REASON_IDS)).max(LOW_RATING_REASON_IDS.length).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;
      // A rating now reaches the ops room, so it has to be on a reply the
      // rater actually received. Not-found for both cases: the id of someone
      // else's turn should not be confirmable.
      const interaction = await ctx.db.aiInteractionHistory.findUnique({
        where: { id: input.aiInteractionId },
        select: { systemUserId: true },
      });
      if (!interaction || interaction.systemUserId !== userId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Reply not found" });
      }

      const existing = await ctx.db.feedback.findFirst({
        where: { userId, aiInteractionId: input.aiInteractionId, feature: "agent_response" },
        orderBy: { createdAt: "desc" },
        select: { id: true, content: true, metadata: true },
      });
      const previous = metadataObject(existing?.metadata);
      const shouldNotify = isLowRating(input.rating) && typeof previous.opsNotifiedAt !== "string";
      const now = new Date().toISOString();
      const metadata = {
        ...previous,
        ...(input.improvementSuggestion !== undefined
          ? { improvementSuggestion: input.improvementSuggestion }
          : {}),
        ...(input.reasons !== undefined ? { reasons: input.reasons } : {}),
        timestamp: now,
        // Claimed with the write, before the post: a double tap must not
        // post twice, and a failed post is not worth a second ping.
        ...(shouldNotify ? { opsNotifiedAt: now } : {}),
      } as Prisma.InputJsonObject;

      const feedbackEntry = existing
        ? await ctx.db.feedback.update({
            where: { id: existing.id },
            data: {
              rating: input.rating,
              content: input.comment ?? existing.content,
              metadata,
            },
            select: { id: true },
          })
        : await ctx.db.feedback.create({
            data: {
              userId,
              feature: "agent_response",
              rating: input.rating,
              content: input.comment ?? "",
              aiInteractionId: input.aiInteractionId,
              metadata,
            },
            select: { id: true },
          });

      if (shouldNotify) {
        // After the response, kept alive by the platform: the person who
        // rated should not wait on a chat room. notifyLowRating never throws.
        runAfterResponse(() => notifyLowRating(ctx.db, feedbackEntry.id));
      }

      // If there's an improvement suggestion, use AI clustering to deduplicate
      if (input.improvementSuggestion) {
        try {
          const embeddingService = getEmbeddingService(ctx.db);
          const result = await embeddingService.processImprovementSuggestion(
            input.improvementSuggestion,
            feedbackEntry.id,
            input.rating
          );
          console.log(
            `[FEEDBACK] Feature request ${result.action}: ${result.featureRequestId}`
          );
        } catch (embeddingError) {
          // Fallback to simple creation if embedding fails
          console.error(
            "[FEEDBACK] Embedding service failed, using fallback:",
            embeddingError
          );
          await ctx.db.featureRequest.create({
            data: {
              title: input.improvementSuggestion.slice(0, 100),
              description: input.improvementSuggestion,
              embedding: [],
              priority: input.rating <= 2 ? 50 : 10,
              feedbackIds: [feedbackEntry.id],
              avgRating: input.rating,
            },
          });
        }
      }

      console.log(
        `[FEEDBACK] Agent feedback: ${input.rating}/5 for interaction ${input.aiInteractionId}`
      );

      return {
        success: true,
        id: feedbackEntry.id,
      };
    }),

  /**
   * Everything needed to see what went wrong on one agent turn: the message,
   * the reply, each tool call with its status and error kind, the model, the
   * page type, the Mastra run with a ready-to-run logs command, and the
   * ratings people gave it. Admin only: this is another person's
   * conversation and raw tool error text.
   */
  getInteractionTrace: adminProcedure
    .input(z.object({ interactionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const interaction = await ctx.db.aiInteractionHistory.findUnique({
        where: { id: input.interactionId },
        select: {
          id: true,
          createdAt: true,
          platform: true,
          agentId: true,
          agentName: true,
          model: true,
          conversationId: true,
          workspaceId: true,
          pageContextType: true,
          mastraRunId: true,
          anthropicRequestId: true,
          promptVersion: true,
          responseTime: true,
          hadError: true,
          errorMessage: true,
          userMessage: true,
          aiResponse: true,
          toolCalls: true,
          user: { select: { name: true, email: true } },
          feedback: {
            where: { feature: "agent_response" },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              rating: true,
              content: true,
              metadata: true,
              createdAt: true,
              user: { select: { name: true, email: true } },
            },
          },
        },
      });
      if (!interaction) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Interaction not found" });
      }

      const toolCalls = parseToolTrace(interaction.toolCalls);
      const faultTickets = await findFaultTickets(ctx.db, toolCalls);
      const logs = agentErrorTraceContext(interaction.mastraRunId ?? undefined, interaction.createdAt);

      return {
        id: interaction.id,
        createdAt: interaction.createdAt,
        platform: interaction.platform,
        agent: interaction.agentName ?? interaction.agentId,
        model: interaction.model,
        conversationId: interaction.conversationId,
        workspaceId: interaction.workspaceId,
        pageContextType: interaction.pageContextType,
        mastraRunId: interaction.mastraRunId,
        mastraLogsCommand: logs.mastraLogs,
        anthropicRequestId: interaction.anthropicRequestId,
        promptVersion: interaction.promptVersion,
        responseTimeMs: interaction.responseTime,
        hadError: interaction.hadError,
        errorMessage: interaction.errorMessage,
        askedBy: interaction.user,
        userMessage: interaction.userMessage,
        aiResponse: interaction.aiResponse,
        toolCalls,
        faultTickets,
        ratings: interaction.feedback.map((f) => {
          const meta = metadataObject(f.metadata);
          return {
            id: f.id,
            rating: f.rating,
            note: f.content,
            reasons: readReasons(f.metadata),
            createdAt: f.createdAt,
            ratedBy: f.user,
            isEvalCandidate: typeof meta.evalCandidateAt === "string",
          };
        }),
      };
    }),

  /**
   * Put a rated turn forward for the golden eval set (ticket 961), or take it
   * back. A flag on the rating, not an `EvalCase` row: those belong to a
   * judged Thread (`threadScoreId` is required), and the golden cases are
   * files in the repo. Whoever writes a case file starts from these.
   */
  setEvalCandidate: adminProcedure
    .input(z.object({ feedbackId: z.string(), candidate: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const feedback = await ctx.db.feedback.findUnique({
        where: { id: input.feedbackId },
        select: { id: true, metadata: true, feature: true },
      });
      if (!feedback || feedback.feature !== "agent_response") {
        throw new TRPCError({ code: "NOT_FOUND", message: "Rating not found" });
      }
      const { evalCandidateAt: _at, evalCandidateBy: _by, ...rest } = metadataObject(feedback.metadata);
      await ctx.db.feedback.update({
        where: { id: feedback.id },
        data: {
          metadata: (input.candidate
            ? { ...rest, evalCandidateAt: new Date().toISOString(), evalCandidateBy: ctx.session.user.id }
            : rest) as Prisma.InputJsonObject,
        },
      });
      return { success: true, candidate: input.candidate };
    }),

  /**
   * Get agent feedback stats for admin dashboard
   */
  getAgentFeedbackStats: protectedProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [todayStats, weekStats, allTimeStats, ratingDistribution] =
      await Promise.all([
        ctx.db.feedback.aggregate({
          where: {
            feature: "agent_response",
            createdAt: { gte: dayAgo },
          },
          _avg: { rating: true },
          _count: { rating: true },
        }),
        ctx.db.feedback.aggregate({
          where: {
            feature: "agent_response",
            createdAt: { gte: weekAgo },
          },
          _avg: { rating: true },
          _count: { rating: true },
        }),
        ctx.db.feedback.aggregate({
          where: { feature: "agent_response" },
          _avg: { rating: true },
          _count: { rating: true },
        }),
        ctx.db.feedback.groupBy({
          by: ["rating"],
          where: { feature: "agent_response" },
          _count: { rating: true },
        }),
      ]);

    return {
      today: {
        count: todayStats._count.rating,
        avgRating: todayStats._avg.rating ?? 0,
      },
      week: {
        count: weekStats._count.rating,
        avgRating: weekStats._avg.rating ?? 0,
      },
      allTime: {
        count: allTimeStats._count.rating,
        avgRating: allTimeStats._avg.rating ?? 0,
      },
      distribution: ratingDistribution.map((r) => ({
        rating: r.rating,
        count: r._count.rating,
      })),
    };
  }),

  /**
   * Get recent low-rated agent feedback for admin alerts
   */
  getLowRatedFeedback: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(10),
      })
    )
    .query(async ({ ctx, input }) => {
      const feedback = await ctx.db.feedback.findMany({
        where: {
          feature: "agent_response",
          rating: { lte: 2 },
        },
        orderBy: { createdAt: "desc" },
        take: input.limit,
        include: {
          user: {
            select: { name: true, email: true },
          },
          aiInteraction: {
            select: {
              id: true,
              userMessage: true,
              aiResponse: true,
              agentName: true,
              platform: true,
            },
          },
        },
      });

      return feedback;
    }),
});