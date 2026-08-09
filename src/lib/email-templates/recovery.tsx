import * as React from 'react'
import { Button, Text } from '@react-email/components'
import { AuthShell, button, text } from './auth-shell'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({ confirmationUrl }: RecoveryEmailProps) => (
  <AuthShell
    preview="Reset your HoopRoom password"
    heading="Reset your password"
    footer="This link expires shortly. If you didn't request a password reset, you can ignore this email — your password won't change."
  >
    <Text style={text}>
      Click the button below to choose a new password for your HoopRoom account.
    </Text>
    <Button style={button} href={confirmationUrl}>
      Reset password
    </Button>
  </AuthShell>
)

export default RecoveryEmail
