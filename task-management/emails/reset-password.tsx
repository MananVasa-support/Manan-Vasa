import { Heading, Text } from "@react-email/components";
import { EmailLayout } from "./_layout";
import { PrimaryButton } from "./_components";

type Props = { link: string };

export function ResetPasswordEmail({ link }: Props) {
  return (
    <EmailLayout preview="Reset your Altus Corp password">
      <Heading style={{ fontSize: 20, color: "#0F172A", margin: "0 0 16px" }}>
        Reset your password
      </Heading>
      <Text style={{ fontSize: 14, color: "#334155", lineHeight: 1.6, margin: "0 0 24px" }}>
        Someone — likely you — asked to reset the password for your Altus Corp Dashboard account.
        Click below to choose a new one. The link expires in 1 hour.
      </Text>
      <div style={{ textAlign: "center" }}>
        <PrimaryButton href={link}>Choose new password</PrimaryButton>
      </div>
      <Text style={{ fontSize: 12, color: "#94A3B8", margin: "24px 0 0" }}>
        If you didn't request this, you can ignore this email — your password won't change.
      </Text>
    </EmailLayout>
  );
}

export default ResetPasswordEmail;
