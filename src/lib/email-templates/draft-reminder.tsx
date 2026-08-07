import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

const LOGO_URL = "https://hooproom.app/email-logo.png";

interface DraftReminderProps {
  managerName?: string;
  roomName?: string;
  startsAt?: string;
  format?: string;
  teamCount?: number;
  rounds?: number;
  joinUrl?: string;
}

const orange = "#f75200";

export function DraftReminderEmail({
  managerName = "Manager",
  roomName = "Your Draft",
  startsAt = "Soon",
  format = "Snake",
  teamCount = 10,
  rounds = 13,
  joinUrl = "https://hooproom.app/lobby",
}: DraftReminderProps) {
  return (
    <Html>
      <Head />
      <Preview>{`${roomName} starts ${startsAt}`}</Preview>
      <Body style={{ backgroundColor: "#0b0b0d", fontFamily: "Helvetica, Arial, sans-serif", margin: 0 }}>
        <Container style={{ maxWidth: "560px", margin: "0 auto", padding: "32px 24px" }}>
          <Section style={{ textAlign: "center", marginBottom: "24px" }}>
            <Text style={{ color: orange, fontSize: "24px", fontWeight: 700, letterSpacing: "-0.5px", margin: 0 }}>
              HoopRoom
            </Text>
          </Section>
          <Section
            style={{
              backgroundColor: "#141417",
              borderRadius: "12px",
              padding: "28px",
              border: "1px solid #26262b",
            }}
          >
            <Heading style={{ color: "#ffffff", fontSize: "20px", margin: "0 0 8px" }}>
              Your draft is coming up
            </Heading>
            <Text style={{ color: "#a1a1aa", fontSize: "14px", margin: "0 0 20px" }}>
              {`Hey ${managerName} — get your rankings ready.`}
            </Text>

            <Text style={{ color: "#ffffff", fontSize: "16px", fontWeight: 600, margin: "0 0 12px" }}>{roomName}</Text>
            <Text style={{ color: "#a1a1aa", fontSize: "14px", margin: "0 0 4px" }}>{`Starts: ${startsAt}`}</Text>
            <Text style={{ color: "#a1a1aa", fontSize: "14px", margin: "0 0 4px" }}>{`Format: ${format}`}</Text>
            <Text style={{ color: "#a1a1aa", fontSize: "14px", margin: "0 0 20px" }}>
              {`${teamCount} teams · ${rounds} rounds`}
            </Text>

            <Button
              href={joinUrl}
              style={{
                backgroundColor: orange,
                color: "#ffffff",
                borderRadius: "8px",
                padding: "12px 20px",
                fontSize: "14px",
                fontWeight: 600,
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              Enter the draft room
            </Button>
          </Section>
          <Hr style={{ borderColor: "#26262b", margin: "24px 0" }} />
          <Text style={{ color: "#6b6b73", fontSize: "12px", textAlign: "center", margin: 0 }}>
            HoopRoom — NBA fantasy drafts
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export const template = {
  component: DraftReminderEmail,
  displayName: "Draft reminder",
  subject: (data: Record<string, any>) => `${data?.roomName ?? "Your draft"} starts ${data?.startsAt ?? "soon"}`,
  previewData: {
    managerName: "Alex",
    roomName: "The Association 2026",
    startsAt: "Sunday, Oct 12 at 7:00 PM CT",
    format: "Snake",
    teamCount: 12,
    rounds: 13,
    joinUrl: "https://hooproom.app/lobby",
  },
} satisfies TemplateEntry;
