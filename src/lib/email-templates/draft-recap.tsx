import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Row,
  Column,
  Section,
  Text,
} from "@react-email/components";
import type { TemplateEntry } from "./registry";

interface RosterPick {
  round?: number;
  pick?: number;
  playerName?: string;
  position?: string;
}

interface DraftRecapProps {
  managerName?: string;
  roomName?: string;
  teamName?: string;
  roster?: RosterPick[];
  summaryUrl?: string;
}

const orange = "#f75200";

export function DraftRecapEmail({
  managerName = "Manager",
  roomName = "Your Draft",
  teamName = "Your Team",
  roster = [],
  summaryUrl = "https://hooproom.app",
}: DraftRecapProps) {
  return (
    <Html>
      <Head />
      <Preview>{`${roomName} is complete — see your roster`}</Preview>
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
            <Heading style={{ color: "#ffffff", fontSize: "20px", margin: "0 0 8px" }}>Draft complete</Heading>
            <Text style={{ color: "#a1a1aa", fontSize: "14px", margin: "0 0 20px" }}>
              {`Nice work, ${managerName}. Here's how ${teamName} shook out in ${roomName}.`}
            </Text>

            {roster.map((p, i) => (
              <Row key={i} style={{ marginBottom: "6px" }}>
                <Column style={{ width: "56px" }}>
                  <Text style={{ color: "#6b6b73", fontSize: "12px", margin: 0 }}>
                    {`${p.round ?? "-"}.${p.pick ?? "-"}`}
                  </Text>
                </Column>
                <Column>
                  <Text style={{ color: "#ffffff", fontSize: "14px", margin: 0 }}>{p.playerName ?? "—"}</Text>
                </Column>
                <Column style={{ width: "70px", textAlign: "right" }}>
                  <Text style={{ color: orange, fontSize: "12px", margin: 0 }}>{p.position ?? ""}</Text>
                </Column>
              </Row>
            ))}

            <Section style={{ marginTop: "24px" }}>
              <Button
                href={summaryUrl}
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
                View draft summary & heatmap
              </Button>
            </Section>
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
  component: DraftRecapEmail,
  displayName: "Draft recap",
  subject: (data: Record<string, any>) => `${data?.roomName ?? "Your draft"} is complete — see your roster`,
  previewData: {
    managerName: "Alex",
    roomName: "The Association 2026",
    teamName: "Splash Bros",
    summaryUrl: "https://hooproom.app",
    roster: [
      { round: 1, pick: 3, playerName: "Nikola Jokic", position: "C" },
      { round: 2, pick: 10, playerName: "Tyrese Haliburton", position: "PG" },
      { round: 3, pick: 3, playerName: "Franz Wagner", position: "SF" },
    ],
  },
} satisfies TemplateEntry;
