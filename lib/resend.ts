import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendInviteEmail({
  to,
  toName,
  inviterName,
  teamName,
}: {
  to: string;
  toName?: string;
  inviterName: string;
  teamName: string;
}): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const signUpUrl = `${appUrl}/auth/sign-up`;

  await transporter.sendMail({
    from: process.env.SMTP_FROM || `"Guidenco" <noreply@guidenco.com>`,
    to,
    subject: `${inviterName} invited you to join ${teamName} on Guidenco`,
    html: `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f9fafb; padding: 40px 0;">
  <div style="max-width: 480px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 40px; border: 1px solid #e5e7eb;">
    <h1 style="font-size: 24px; font-weight: 700; color: #111827; margin: 0 0 8px;">You're invited!</h1>
    <p style="color: #6b7280; margin: 0 0 24px;">
      <strong style="color: #111827;">${inviterName}</strong> has invited ${toName ? `<strong style="color: #111827;">${toName}</strong>` : 'you'} to join the <strong style="color: #111827;">${teamName}</strong> team on Guidenco.
    </p>
    <a href="${signUpUrl}" style="display: inline-block; background: #2563eb; color: #fff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 15px;">
      Accept Invitation
    </a>
    <p style="color: #9ca3af; font-size: 13px; margin: 24px 0 0;">
      Sign up with this email address (<strong>${to}</strong>) and you'll automatically be added to the team.
    </p>
  </div>
</body>
</html>
    `.trim(),
  });
}
