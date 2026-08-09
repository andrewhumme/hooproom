import * as React from 'react'
import { Button, Text } from '@react-email/components'
import { AuthShell, button, text } from './auth-shell'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({ confirmationUrl }: MagicLinkEmailProps) => (
  <AuthShell
    preview="Your HoopRoom login link"
    heading="Your login link"
    footer="This link expires shortly. If you didn't request it, you can safely ignore this email."
  >
    <Text style={text}>Click below to sign in to HoopRoom.</Text>
    <Button style={button} href={confirmationUrl}>
      Sign in
    </Button>
  </AuthShell>
)

export default MagicLinkEmail
