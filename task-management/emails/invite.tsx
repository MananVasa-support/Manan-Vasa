import { Heading, Text } from "@react-email/components";
import { EmailLayout } from "./_layout";
import { PrimaryButton } from "./_components";

type Props = {
  inviteeName: string;
  inviterName: string;
  link: string;
};

export function InviteEmail({ inviteeName, inviterName, link }: Props) {
  return (
    <EmailLayout preview={`${inviterName} invited you to Altus Corp Dashboard`}>
      <Heading style={{ fontSize: 20, color: "#0F172A", margin: "0 0 16px" }}>
        Hi {inviteeName},
      </Heading>
      <Text style={{ fontSize: 14, color: "#334155", lineHeight: 1.6, margin: "0 0 16px" }}>
        <strong>{inviterName}</strong> has invited you to the Altus Corp Dashboard —
        the work-management tool Altus Corp is using to track tasks across the team.
      </Text>
      <Text style={{ fontSize: 14, color: "#334155", lineHeight: 1.6, margin: "0 0 24px" }}>
        Click below to set your password and sign in. This link expires in 24 hours.
      </Text>
      <div style={{ textAlign: "center" }}>
        <PrimaryButton href={link}>Set password and sign in</PrimaryButton>
      </div>
      <Text style={{ fontSize: 12, color: "#94A3B8", margin: "24px 0 0" }}>
        If you weren't expecting this, you can ignore this email.
      </Text>
    </EmailLayout>
  );
}

export default InviteEmail;
