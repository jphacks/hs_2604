import { DELIVERY_LABEL, PHASE_LABEL, type CallPhase, type DeliveryState } from "@/lib/domain/rules";
import { APPLICATION_STATUS_LABEL, CHANNEL_LABEL, type ApplicationStatus, type Channel } from "@/lib/domain/types";
import { Badge, type Tone } from "./parts";

const PHASE_TONE: Record<CallPhase, Tone> = {
  draft: "gray",
  upcoming: "blue",
  open: "green",
  ended: "amber",
  closed: "gray",
};

export function PhaseBadge({ phase }: { phase: CallPhase }) {
  return <Badge tone={PHASE_TONE[phase]}>{PHASE_LABEL[phase]}</Badge>;
}

const STATUS_TONE: Record<ApplicationStatus, Tone> = { submitted: "blue", approved: "green", rejected: "red" };

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{APPLICATION_STATUS_LABEL[status]}</Badge>;
}

const DELIVERY_TONE: Record<DeliveryState, Tone> = {
  delivering: "green",
  scheduled: "blue",
  ended: "gray",
  suspended: "red",
  none: "gray",
};

export function DeliveryBadge({ channel, state }: { channel: Channel; state: DeliveryState }) {
  return (
    <Badge tone={DELIVERY_TONE[state]}>
      {CHANNEL_LABEL[channel]}：{DELIVERY_LABEL[state]}
    </Badge>
  );
}

export function ChannelTags({ channels }: { channels: Channel[] }) {
  return (
    <span className="inline-flex gap-1">
      {channels.map((c) => (
        <span key={c} className="rounded border border-line px-1.5 py-0.5 text-xs text-muted">
          {CHANNEL_LABEL[c]}
        </span>
      ))}
    </span>
  );
}
