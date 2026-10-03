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

interface OnTheClockProps {
  managerName?: string;
  teamName?: string;
  roomName?: string;
  round?: number;
  pickInRound?: number;
  overall?: number;
  timeToPick?: string;
  draftUrl?: string;
}

const orange = "#f75200";

export function OnTheClockEmail({
  managerName = "Manager",
  teamName = "Your team",
  roomName = "Your Draft",
  round = 1,
  pickInRound = 1,
  overall = 1,
  timeToPick = "8 hours",
  draftUrl = "https://hooproom.app/lobby",
}: OnTheClockProps) {
  return (
    <Html>
      <Head />
      <Preview>{`You're on the clock in ${roomName} — ${timeToPick} to pick`}</Preview>
      <Body style={{ backgroundColor: "#0b0b0d", fontFamily: "Helvetica, Arial, sans-serif", margin: 0 }}>
        <Container style={{ maxWidth: "560px", margin: "0 auto", padding: "32px 24px" }}>
          <Section style={{ textAlign: "center", marginBottom: "24px" }}>
            <Img
              src={LOGO_URL}
              width="48"
              height="48"
              alt="HoopRoom"
              style={{ borderRadius: "12px", display: "inline-block", margin: "0 auto 10px" }}
            />
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
              You're on the clock
            </Heading>
            <Text style={{ color: "#a1a1aa", fontSize: "14px", margin: "0 0 20px" }}>
              {`Hey ${managerName} — it's ${teamName}'s turn to pick.`}
            </Text>

            <Text style={{ color: "#ffffff", fontSize: "16px", fontWeight: 600, margin: "0 0 12px" }}>{roomName}</Text>
            <Text style={{ color: "#a1a1aa", fontSize: "14px", margin: "0 0 4px" }}>
              {`Round ${round}, pick ${pickInRound} (#${overall} overall)`}
            </Text>
            <Text style={{ color: "#a1a1aa", fontSize: "14px", margin: "0 0 20px" }}>
              {`You have ${timeToPick} to pick. If the clock runs out, we'll autopick from your queue, then the best available player.`}
            </Text>

            <Button
              href={draftUrl}
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
              Make your pick
            </Button>
          </Section>
          <Hr style={{ borderColor: "#26262b", margin: "24px 0" }} />
          <Section style={{ textAlign: "center" }}>
            <Img
              src={LOGO_URL}
              width="24"
              height="24"
              alt="HoopRoom"
              style={{ borderRadius: "6px", display: "inline-block", opacity: 0.7 }}
            />
            <Text style={{ color: "#6b6b73", fontSize: "12px", textAlign: "center", margin: "8px 0 0" }}>
              HoopRoom — NBA fantasy drafts
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export const template = {
  component: OnTheClockEmail,
  displayName: "On the clock",
  subject: (data: Record<string, any>) => `You're on the clock in ${data?.roomName ?? "your draft"}`,
  previewData: {
    managerName: "Alex",
    teamName: "Splash Bros",
    roomName: "The Association 2026",
    round: 2,
    pickInRound: 4,
    overall: 16,
    timeToPick: "8 hours",
    draftUrl: "https://hooproom.app/lobby",
  },
} satisfies TemplateEntry;
