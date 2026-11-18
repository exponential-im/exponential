"use client";

import { useState, useEffect, useRef, memo } from "react";
import {
  Rating,
  Text,
  Textarea,
  Button,
  Group,
  Collapse,
  Paper,
} from "@mantine/core";
import { IconCheck, IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { Panel } from "~/app/_components/ui";
import { MarkdownInput } from "~/app/_components/shared/MarkdownInput";
import {
  isLowRating,
  LOW_RATING_REASONS,
  type LowRatingReasonId,
} from "~/lib/feedback/lowRating";

interface AgentMessageFeedbackProps {
  aiInteractionId: string;
  conversationId?: string;
  agentName?: string;
}

const RATED_MESSAGES_KEY = "agent-feedback-rated";

function getRatedMessages(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const stored = localStorage.getItem(RATED_MESSAGES_KEY);
    return stored ? new Set(JSON.parse(stored) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function markAsRated(interactionId: string) {
  if (typeof window === "undefined") return;
  const rated = getRatedMessages();
  rated.add(interactionId);
  // Keep only last 100 to prevent unbounded growth
  const arr = Array.from(rated).slice(-100);
  localStorage.setItem(RATED_MESSAGES_KEY, JSON.stringify(arr));
}

export const AgentMessageFeedback = memo(function AgentMessageFeedback({
  aiInteractionId,
  conversationId: _conversationId,
  agentName: _agentName,
}: AgentMessageFeedbackProps) {
  const [rating, setRating] = useState(0);
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState("");
  const [improvementSuggestion, setImprovementSuggestion] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [alreadyRated, setAlreadyRated] = useState(false);
  // A thumbs-down is sent the moment it is tapped, then the person is asked
  // why. `lowSent` is "the rating has gone, the why-panel is open".
  const [lowSent, setLowSent] = useState(false);
  const [reasons, setReasons] = useState<LowRatingReasonId[]>([]);

  useEffect(() => {
    setAlreadyRated(getRatedMessages().has(aiInteractionId));
  }, [aiInteractionId]);

  const submitFeedback = api.feedback.submitAgentFeedback.useMutation({
    onSuccess: () => {
      markAsRated(aiInteractionId);
      setSubmitted(true);
    },
  });

  // The low-rating path: the rating itself, then each reason tap and the
  // note, all land on the same row (the server keeps one rating per reply).
  const submitLow = api.feedback.submitAgentFeedback.useMutation({
    onSuccess: () => markAsRated(aiInteractionId),
  });
  // Sent one at a time, in tap order: each call carries the whole current
  // state, so a later one landing first would be overwritten by an older one.
  const lowQueue = useRef<Promise<unknown>>(Promise.resolve());
  const [isFinishing, setIsFinishing] = useState(false);
  const [noteFailed, setNoteFailed] = useState(false);
  const sendLow = (payload: { rating: number; reasons: LowRatingReasonId[]; comment?: string }) => {
    const sent = lowQueue.current
      .catch(() => undefined)
      .then(() => submitLow.mutateAsync({ aiInteractionId, ...payload }));
    lowQueue.current = sent;
    return sent;
  };

  const handleRatingChange = (value: number) => {
    setRating(value);
    if (isLowRating(value)) {
      setShowComment(false);
      setLowSent(true);
      // A failure here is retried by the next tap, which resends everything.
      sendLow({ rating: value, reasons }).catch(() => undefined);
    } else {
      // A low rating already went out and was a mis-tap: send the correction,
      // or the record keeps the low one. It updates the same row, and the
      // ops post is not repeated or withdrawn.
      if (lowSent) sendLow({ rating: value, reasons }).catch(() => undefined);
      setLowSent(false);
    }
  };

  const toggleReason = (id: LowRatingReasonId) => {
    const next = reasons.includes(id) ? reasons.filter((r) => r !== id) : [...reasons, id];
    setReasons(next);
    sendLow({ rating, reasons: next }).catch(() => undefined);
  };

  // Thanks only once everything has been saved: the reply is marked as rated
  // on this device, so a note lost here could not be sent again later.
  const finishLow = async () => {
    const note = comment.trim();
    setIsFinishing(true);
    setNoteFailed(false);
    try {
      await sendLow({ rating, reasons, ...(note ? { comment: note } : {}) });
      setSubmitted(true);
    } catch {
      setNoteFailed(true);
    } finally {
      setIsFinishing(false);
    }
  };

  const handleSubmit = () => {
    if (rating === 0) return;

    submitFeedback.mutate({
      aiInteractionId,
      rating,
      comment: comment || undefined,
      improvementSuggestion: improvementSuggestion || undefined,
    });
  };

  // Quick submit without comment for high ratings
  const handleQuickSubmit = () => {
    if (rating === 0) return;

    submitFeedback.mutate({
      aiInteractionId,
      rating,
    });
  };

  if (alreadyRated || submitted) {
    if (submitted) {
      return (
        <Group gap="xs" className="mt-2 opacity-60">
          <IconCheck size={14} className="text-brand-success" />
          <Text size="xs" className="text-text-muted">
            Thanks for your feedback!
          </Text>
        </Group>
      );
    }
    return null;
  }

  return (
    <div className="mt-2">
      <Group gap="xs" align="center">
        <Text size="xs" className="text-text-muted">
          Rate this response:
        </Text>
        <Rating
          value={rating}
          onChange={handleRatingChange}
          size="sm"
          fractions={1}
        />
        {rating > 0 && !lowSent && !showComment && (
          <>
            <Button
              size="compact-xs"
              variant="subtle"
              onClick={handleQuickSubmit}
              loading={submitFeedback.isPending}
            >
              Submit
            </Button>
            <Button
              size="compact-xs"
              variant="subtle"
              color="gray"
              onClick={() => setShowComment(true)}
              rightSection={<IconChevronDown size={12} />}
            >
              Add comment
            </Button>
          </>
        )}
        {showComment && !lowSent && (
          <Button
            size="compact-xs"
            variant="subtle"
            color="gray"
            onClick={() => setShowComment(false)}
            rightSection={<IconChevronUp size={12} />}
          >
            Hide
          </Button>
        )}
      </Group>

      <Collapse in={lowSent}>
        <Panel padding="sm" className="mt-2 space-y-3">
          <Text size="xs" className="text-text-secondary">
            Thanks, that is recorded. What went wrong?
          </Text>
          <Group gap="xs">
            {LOW_RATING_REASONS.map((reason) => (
              <Button
                key={reason.id}
                size="compact-xs"
                variant={reasons.includes(reason.id) ? "filled" : "default"}
                aria-pressed={reasons.includes(reason.id)}
                onClick={() => toggleReason(reason.id)}
              >
                {reason.label}
              </Button>
            ))}
          </Group>
          <MarkdownInput
            placeholder="Anything else? (optional)"
            value={comment}
            onChange={(value) => setComment(value.slice(0, 2000))}
            minRows={2}
          />
          <Group justify="flex-end" gap="sm">
            {noteFailed && (
              <Text size="xs" className="text-error-text" role="alert">
                That did not save. Try again.
              </Text>
            )}
            <Button size="xs" variant="subtle" loading={isFinishing} onClick={() => void finishLow()}>
              Done
            </Button>
          </Group>
        </Panel>
      </Collapse>

      <Collapse in={showComment && !lowSent}>
        <Paper className="mt-2 space-y-3 border border-border-primary bg-surface-secondary p-3">
          <Textarea
            placeholder="Any comments about this response? (optional)"
            value={comment}
            onChange={(e) => setComment(e.currentTarget.value)}
            size="xs"
            minRows={2}
            autosize
          />

          {rating <= 3 && (
            <Textarea
              placeholder="What could have made this response better?"
              value={improvementSuggestion}
              onChange={(e) => setImprovementSuggestion(e.currentTarget.value)}
              size="xs"
              minRows={2}
              autosize
              description="This helps us improve the agent"
            />
          )}

          <Group justify="flex-end">
            <Button
              size="xs"
              onClick={handleSubmit}
              loading={submitFeedback.isPending}
              disabled={rating === 0}
            >
              Submit Feedback
            </Button>
          </Group>
        </Paper>
      </Collapse>
    </div>
  );
});
