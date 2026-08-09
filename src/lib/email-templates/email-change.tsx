import * as React from 'react'
import { Button, Text } from '@react-email/components'
import { AuthShell, button, text } from './auth-shell'

interface EmailChangeEmailProps {
  siteName: string
  // oldEmail is the user's current address (HookData.OldEmail). For the
  // NEW-recipient half of a secure email_change fanout, `email` equals the
  // recipient (NEW), so the "from" line must render oldEmail.
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  oldEmail,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <AuthShell
    preview="Confirm your new HoopRoom email"
    heading="Confirm your email change"
    footer="If you didn't request this change, secure your account immediately."
  >
    <Text style={text}>
      You asked to change your HoopRoom email from {oldEmail} to {newEmail}.
    </Text>
    <Button style={button} href={confirmationUrl}>
      Confirm email change
    </Button>
  </AuthShell>
)

export default EmailChangeEmail
