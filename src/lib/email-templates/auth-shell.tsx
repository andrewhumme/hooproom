import * as React from 'react'
import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from '@react-email/components'

const LOGO_URL = 'https://hooproom.app/email-logo.png'
export const ORANGE = '#f75200'

export const text = {
  color: '#a1a1aa',
  fontSize: '14px',
  lineHeight: '1.6',
  margin: '0 0 18px',
}

export const link = { color: ORANGE, textDecoration: 'underline' }

export const button = {
  backgroundColor: ORANGE,
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 700,
  borderRadius: '10px',
  padding: '13px 22px',
  textDecoration: 'none',
  display: 'inline-block',
}

export const codeStyle = {
  color: '#ffffff',
  fontSize: '30px',
  fontWeight: 700,
  letterSpacing: '8px',
  backgroundColor: '#0b0b0d',
  border: '1px solid #26262b',
  borderRadius: '10px',
  padding: '16px',
  textAlign: 'center' as const,
  margin: '0 0 18px',
}

export const footerText = {
  color: '#71717a',
  fontSize: '12px',
  lineHeight: '1.6',
  margin: '22px 0 0',
}

export function AuthShell({
  preview,
  heading,
  children,
  footer,
}: {
  preview: string
  heading: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <Html lang="en" dir="ltr">
      <Head />
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: '#ffffff',
          fontFamily: 'Helvetica, Arial, sans-serif',
          margin: 0,
        }}
      >
        <Container style={{ maxWidth: '560px', margin: '0 auto', padding: '32px 24px' }}>
          <Section style={{ textAlign: 'center', marginBottom: '24px' }}>
            <Img
              src={LOGO_URL}
              width="48"
              height="48"
              alt="HoopRoom"
              style={{ borderRadius: '12px', display: 'inline-block', margin: '0 auto 10px' }}
            />
            <Text
              style={{
                color: ORANGE,
                fontSize: '24px',
                fontWeight: 700,
                letterSpacing: '-0.5px',
                margin: 0,
              }}
            >
              HoopRoom
            </Text>
          </Section>

          <Section
            style={{
              backgroundColor: '#141417',
              borderRadius: '12px',
              padding: '28px',
              border: '1px solid #26262b',
            }}
          >
            <Heading style={{ color: '#ffffff', fontSize: '20px', margin: '0 0 14px' }}>
              {heading}
            </Heading>
            {children}
            {footer && <Text style={footerText}>{footer}</Text>}
          </Section>

          <Section style={{ textAlign: 'center', marginTop: '20px' }}>
            <Img
              src={LOGO_URL}
              width="22"
              height="22"
              alt="HoopRoom"
              style={{ borderRadius: '6px', display: 'inline-block', opacity: 0.7 }}
            />
            <Text style={{ color: '#71717a', fontSize: '11px', margin: '6px 0 0' }}>
              HoopRoom — custom NBA fantasy drafts
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
