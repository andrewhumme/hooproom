import * as React from 'react'
import { Text } from '@react-email/components'
import { AuthShell, codeStyle, text } from './auth-shell'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <AuthShell
    preview="Your HoopRoom verification code"
    heading="Confirm it's you"
    footer="This code expires shortly. If you didn't request it, you can safely ignore this email."
  >
    <Text style={text}>Use the code below to confirm your identity:</Text>
    <Text style={codeStyle}>{token}</Text>
  </AuthShell>
)

export default ReauthenticationEmail
