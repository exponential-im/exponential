"use client";

import Link from "next/link";
import { Anchor, Button, Code, CopyButton, Group, Skeleton, Stack, Text, Title } from "@mantine/core";
import { IconArrowLeft, IconCheck, IconCopy, IconX } from "@tabler/icons-react";
import { api } from "~/trpc/react";
import { Panel, Pill, SectionHeader } from "~/app/_components/ui";
import { MarkdownRenderer } from "~/app/_components/shared/MarkdownRenderer";
import { toolErrorSentence } from "~/lib/chat/toolErrors";
import { isLowRating, lowRatingReasonLabel } from "~/lib/feedback/lowRating";

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Text size="xs" className="text-text-muted">
        {label}
      </Text>
      <Text size="sm" className="break-all text-text-primary">
        {children}
      </Text>
    </div>
  );
}

/**
 * One agent turn, laid out for whoever has to work out what went wrong: what
 * was asked, what came back, each tool call with its outcome, and how to find
 * the run in Mastra's logs. Reached from the ops-room post a low rating sends.
 */
export function InteractionTrace({ interactionId }: { interactionId: string }) {
  const utils = api.useUtils();
  const { data: trace, isLoading, error } = api.feedback.getInteractionTrace.useQuery({ interactionId });
  const setEvalCandidate = api.feedback.setEvalCandidate.useMutation({
    onSuccess: () => utils.feedback.getInteractionTrace.invalidate({ interactionId }),
  });

  if (isLoading) {
    return (
      <Stack gap="md">
        <Skeleton height={32} width={280} />
        <Skeleton height={160} />
        <Skeleton height={240} />
      </Stack>
    );
  }
  if (error || !trace) {
    return (
      <Panel>
        <Text className="text-text-secondary">
          {error?.data?.code === "NOT_FOUND"
            ? "There is no interaction with this id."
            : "This trace could not be loaded."}
        </Text>
      </Panel>
    );
  }

  const failedCount = trace.toolCalls.filter((c) => c.status === "failed").length;

  return (
    <Stack gap="lg" className="max-w-4xl">
      <div>
        <Anchor component={Link} href="/admin/feedback" size="sm">
          <Group gap={4}>
            <IconArrowLeft size={14} />
            Feedback
          </Group>
        </Anchor>
        <Title order={2} className="mt-2 text-text-primary">
          Turn trace
        </Title>
        <Text size="sm" className="text-text-muted">
          {new Date(trace.createdAt).toLocaleString()}
          {trace.askedBy ? ` · asked by ${trace.askedBy.name ?? trace.askedBy.email ?? "unknown"}` : ""}
        </Text>
      </div>

      <Panel>
        <SectionHeader title="Ratings" count={trace.ratings.length} className="mb-3" />
        {trace.ratings.length === 0 ? (
          <Text size="sm" className="text-text-muted">
            Nobody has rated this reply.
          </Text>
        ) : (
          <Stack gap="sm">
            {trace.ratings.map((rating) => (
              <Group key={rating.id} justify="space-between" align="flex-start" wrap="nowrap">
                <div>
                  <Group gap="xs">
                    <Pill tone={isLowRating(rating.rating) ? "danger" : "neutral"} size="sm">
                      {rating.rating}/5
                    </Pill>
                    {rating.reasons.map((reason) => (
                      <Pill key={reason} tone="warning" size="sm">
                        {lowRatingReasonLabel(reason)}
                      </Pill>
                    ))}
                    {rating.isEvalCandidate && (
                      <Pill tone="brand" size="sm">
                        Eval candidate
                      </Pill>
                    )}
                    <Text size="xs" className="text-text-muted">
                      {rating.ratedBy.name ?? rating.ratedBy.email ?? "unknown"} ·{" "}
                      {new Date(rating.createdAt).toLocaleString()}
                    </Text>
                  </Group>
                  {rating.note && (
                    <div className="mt-1">
                      <MarkdownRenderer content={rating.note} variant="compact" />
                    </div>
                  )}
                </div>
                <Button
                  size="compact-xs"
                  variant="default"
                  loading={setEvalCandidate.isPending && setEvalCandidate.variables?.feedbackId === rating.id}
                  onClick={() =>
                    setEvalCandidate.mutate({ feedbackId: rating.id, candidate: !rating.isEvalCandidate })
                  }
                >
                  {rating.isEvalCandidate ? "Remove from eval candidates" : "Promote to eval candidate"}
                </Button>
              </Group>
            ))}
          </Stack>
        )}
      </Panel>

      <Panel>
        <SectionHeader title="Run" className="mb-3" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <Fact label="Agent">{trace.agent ?? "unknown"}</Fact>
          <Fact label="Model">{trace.model ?? "unknown"}</Fact>
          <Fact label="Page context type">{trace.pageContextType ?? "not recorded"}</Fact>
          <Fact label="Platform">{trace.platform}</Fact>
          <Fact label="Response time">
            {trace.responseTimeMs != null ? `${(trace.responseTimeMs / 1000).toFixed(1)} s` : "not recorded"}
          </Fact>
          <Fact label="Prompt version">{trace.promptVersion ?? "not recorded"}</Fact>
          <Fact label="Mastra run id">{trace.mastraRunId ?? "not recorded"}</Fact>
          <Fact label="Anthropic request id">{trace.anthropicRequestId ?? "not recorded"}</Fact>
          <Fact label="Conversation">{trace.conversationId ?? "none"}</Fact>
        </div>
        <Text size="xs" className="mb-1 mt-4 text-text-muted">
          Mastra logs for this turn
          {trace.mastraRunId ? "" : " (no run id on this row, so the command covers the time window only)"}
        </Text>
        <Group gap="xs" align="flex-start" wrap="nowrap">
          <Code block className="flex-1 whitespace-pre-wrap break-all">
            {trace.mastraLogsCommand}
          </Code>
          <CopyButton value={trace.mastraLogsCommand ?? ""}>
            {({ copied, copy }) => (
              <Button size="compact-sm" variant="default" onClick={copy} leftSection={<IconCopy size={14} />}>
                {copied ? "Copied" : "Copy"}
              </Button>
            )}
          </CopyButton>
        </Group>
        {trace.faultTickets.length > 0 && (
          <Stack gap={4} className="mt-4">
            <Text size="xs" className="text-text-muted">
              Tool faults on this turn that already have a ticket
            </Text>
            {trace.faultTickets.map((ticket) => (
              <Anchor key={ticket.url} href={ticket.url} size="sm">
                {ticket.summary}
              </Anchor>
            ))}
          </Stack>
        )}
      </Panel>

      <Panel>
        <SectionHeader title="User message" className="mb-3" />
        <Text size="sm" className="whitespace-pre-wrap text-text-primary">
          {trace.userMessage}
        </Text>
      </Panel>

      <Panel>
        <SectionHeader
          title="Tool calls"
          count={trace.toolCalls.length}
          className="mb-3"
          action={
            failedCount > 0 ? (
              <Pill tone="danger" size="sm">
                {failedCount} failed
              </Pill>
            ) : undefined
          }
        />
        {trace.toolCalls.length === 0 ? (
          <Text size="sm" className="text-text-muted">
            The agent called no tools on this turn.
          </Text>
        ) : (
          <Stack gap="sm">
            {trace.toolCalls.map((call, index) => (
              <Panel key={`${call.name}-${index}`} variant="muted" radius="md" padding="sm">
                <Group gap="xs">
                  <Text size="xs" className="text-text-muted">
                    {index + 1}
                  </Text>
                  <Text size="sm" fw={600} className="text-text-primary">
                    {call.name}
                  </Text>
                  {call.status === "failed" ? (
                    <Pill tone="danger" size="sm" icon={<IconX size={12} />}>
                      failed · {call.errorKind ?? "unknown"}
                    </Pill>
                  ) : (
                    <Pill tone="neutral" size="sm" icon={<IconCheck size={12} />}>
                      ok
                    </Pill>
                  )}
                  {call.providerExecuted && (
                    <Pill tone="neutral" size="sm">
                      provider tool
                    </Pill>
                  )}
                </Group>
                {call.status === "failed" && (
                  <Text size="xs" className="mt-2 text-text-secondary">
                    What the person saw: {toolErrorSentence(call.errorKind)}
                  </Text>
                )}
                {call.errorCode && (
                  <>
                    <Text size="xs" className="mt-2 text-text-muted">
                      Raw error (cut to 200 characters when stored)
                    </Text>
                    <Code block className="whitespace-pre-wrap break-all">
                      {call.errorCode}
                    </Code>
                  </>
                )}
                <Text size="xs" className="mt-2 text-text-muted">
                  Arguments (secrets redacted)
                </Text>
                <Code block className="whitespace-pre-wrap break-all">
                  {call.argsDropped ? "Dropped: this turn's arguments went over the stored size limit." : call.args || "{}"}
                </Code>
              </Panel>
            ))}
          </Stack>
        )}
      </Panel>

      <Panel>
        <SectionHeader title="Reply" className="mb-3" />
        {trace.aiResponse ? (
          <MarkdownRenderer content={trace.aiResponse} variant="compact" />
        ) : (
          <Text size="sm" className="text-text-muted">
            The reply was empty.
          </Text>
        )}
      </Panel>

      {trace.errorMessage && (
        <Panel>
          <SectionHeader title="Turn error record" className="mb-3" />
          <Code block className="whitespace-pre-wrap break-all">
            {trace.errorMessage}
          </Code>
        </Panel>
      )}
    </Stack>
  );
}
