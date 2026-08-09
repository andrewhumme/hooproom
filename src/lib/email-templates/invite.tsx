import * as React from 'react'
import { Button, Text } from '@react-email/components'
import { AuthShell, button, text } from './auth-shell'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({ confirmationUrl }: InviteEmailProps) => (
  <AuthShell
    preview="You've been invited to HoopRoom"
    heading="You've been invited"
    footer="If you weren't expecting this invite, you can safely ignore this email."
  >
    <Text style={text}>
      You've been invited to join HoopRoom — custom NBA fantasy drafts. Accept below to set
      up your account.
    </Text>
    <Button style={button} href={confirmationUrl}>
      Accept invite
    </Button>
  </AuthShell>
)

export default InviteEmail
