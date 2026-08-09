import * as React from 'react'
import { Button, Text } from '@react-email/components'
import { AuthShell, button, text } from './auth-shell'

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({ recipient, confirmationUrl }: SignupEmailProps) => (
  <AuthShell
    preview="Confirm your email for HoopRoom"
    heading="Confirm your email"
    footer="If you didn't create a HoopRoom account, you can safely ignore this email."
  >
    <Text style={text}>
      Thanks for signing up for HoopRoom. Confirm {recipient} to start hosting and joining
      NBA drafts.
    </Text>
    <Button style={button} href={confirmationUrl}>
      Verify email
    </Button>
  </AuthShell>
)

export default SignupEmail
