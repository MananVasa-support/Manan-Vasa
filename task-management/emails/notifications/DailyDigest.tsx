import {
  Chip,
  NotificationEmailLayout,
  NotificationHeadline,
  NotificationParagraph,
  stripTrailingSlash,
  taskUrl,
} from "./_notification-layout";
import type { OverdueDigestTask } from "./types";

export interface DailyDigestProps {
  recipientName: string;
  overdueTasks: OverdueDigestTask[];
  siteUrl: string;
}

export const previewText = (p: Pick<DailyDigestProps, "overdueTasks">) => {
  const n = p.overdueTasks.length;
  if (n === 0) return "No overdue tasks today";
  if (n === 1) return "You have 1 overdue task";
  return `You have ${n} overdue tasks`;
};

const DATE_FMT = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
});

function formatDue(d: Date): string {
  return DATE_FMT.format(d);
}

export function DailyDigestEmail(props: DailyDigestProps) {
  const n = props.overdueTasks.length;
  const headline = n === 1
    ? "You have 1 overdue task."
    : `You have ${n} overdue tasks.`;

  return (
    <NotificationEmailLayout
      preview={previewText({ overdueTasks: props.overdueTasks })}
      siteUrl={props.siteUrl}
    >
      <NotificationParagraph muted>
        Hi {props.recipientName},
      </NotificationParagraph>
      <NotificationHeadline>{headline}</NotificationHeadline>
      <NotificationParagraph>
        Here's where things stand. Tap any row to open the task and either close it
        out or reassign.
      </NotificationParagraph>

      <table
        role="presentation"
        cellPadding={0}
        cellSpacing={0}
        style={{
          width: "100%",
          borderCollapse: "collapse",
          margin: "8px 0 16px",
          fontSize: 13,
        }}
      >
        <thead>
          <tr>
            <th style={thStyle}>Task</th>
            <th style={{ ...thStyle, width: 96 }}>Overdue</th>
            <th style={{ ...thStyle, width: 120 }}>Assignee</th>
            <th style={{ ...thStyle, width: 76, textAlign: "right" }}>Due</th>
          </tr>
        </thead>
        <tbody>
          {props.overdueTasks.map((t) => (
            <tr key={t.id}>
              <td style={tdStyle}>
                <a
                  href={taskUrl(props.siteUrl, t.id)}
                  style={{
                    color: "#0F172A",
                    fontWeight: 600,
                    textDecoration: "none",
                    lineHeight: 1.4,
                  }}
                >
                  {t.subject}
                </a>
              </td>
              <td style={tdStyle}>
                <Chip tone={t.daysOverdue >= 7 ? "red" : "amber"}>
                  {t.daysOverdue}d
                </Chip>
              </td>
              <td style={{ ...tdStyle, color: "#475569" }}>{t.doerName}</td>
              <td
                style={{
                  ...tdStyle,
                  textAlign: "right",
                  color: "#64748B",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {formatDue(t.dueAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ textAlign: "center", margin: "24px 0 4px" }}>
        <a
          href={`${stripTrailingSlash(props.siteUrl)}/tasks?overdue=1`}
          style={{
            display: "inline-block",
            backgroundColor: "#E10600",
            color: "#ffffff",
            padding: "12px 24px",
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          See all overdue tasks
        </a>
      </div>
    </NotificationEmailLayout>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  borderBottom: "1px solid #E2E8F0",
  padding: "8px 8px",
  color: "#64748B",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  fontWeight: 600,
};

const tdStyle: React.CSSProperties = {
  borderBottom: "1px solid #F1F5F9",
  padding: "10px 8px",
  verticalAlign: "middle",
};

export default DailyDigestEmail;
