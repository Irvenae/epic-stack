import { type Submission } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { json } from '@remix-run/node'
import { and, eq, gt, isNull, or } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from '#app/db.server'
import { handleVerification as handleChangeEmailVerification } from '#app/routes/settings+/profile.change-email.server.tsx'
import { twoFAVerificationType } from '#app/routes/settings+/profile.two-factor.tsx'
import { requireUserId } from '#app/utils/auth.server.ts'
import { getDomainUrl } from '#app/utils/misc.tsx'
import { redirectWithToast } from '#app/utils/toast.server.ts'
import { generateTOTP, verifyTOTP } from '#app/utils/totp.server.ts'
import { type twoFAVerifyVerificationType } from '../settings+/profile.two-factor.verify.tsx'
import {
  handleVerification as handleLoginTwoFactorVerification,
  shouldRequestTwoFA,
} from './login.server.ts'
import { handleVerification as handleOnboardingVerification } from './onboarding.server.ts'
import { handleVerification as handleResetPasswordVerification } from './reset-password.server.ts'
import {
  VerifySchema,
  codeQueryParam,
  redirectToQueryParam,
  targetQueryParam,
  typeQueryParam,
  type VerificationTypes,
} from './verify.tsx'

export type VerifyFunctionArgs = {
	request: Request
	submission: Submission<
		z.input<typeof VerifySchema>,
		string[],
		z.output<typeof VerifySchema>
	>
	body: FormData | URLSearchParams
}

export function getRedirectToUrl({
  request,
  type,
  target,
  redirectTo,
}: {
	request: Request
	type: VerificationTypes
	target: string
	redirectTo?: string
}) {
  const redirectToUrl = new URL(`${getDomainUrl(request)}/verify`)
  redirectToUrl.searchParams.set(typeQueryParam, type)
  redirectToUrl.searchParams.set(targetQueryParam, target)
  if (redirectTo) {
    redirectToUrl.searchParams.set(redirectToQueryParam, redirectTo)
  }
  return redirectToUrl
}

export async function requireRecentVerification(request: Request) {
  const userId = await requireUserId(request)
  const shouldReverify = await shouldRequestTwoFA(request)
  if (shouldReverify) {
    const reqUrl = new URL(request.url)
    const redirectUrl = getRedirectToUrl({
      request,
      target: userId,
      type: twoFAVerificationType,
      redirectTo: reqUrl.pathname + reqUrl.search,
    })
    throw await redirectWithToast(redirectUrl.toString(), {
      title: 'Please Reverify',
      description: 'Please reverify your account before proceeding',
    })
  }
}

export async function prepareVerification({
  period,
  request,
  type,
  target,
}: {
	period: number
	request: Request
	type: VerificationTypes
	target: string
}) {
  const verifyUrl = getRedirectToUrl({ request, type, target })
  const redirectTo = new URL(verifyUrl.toString())

  const { otp, ...verificationConfig } = generateTOTP({
    algorithm: 'SHA256',
    // Leaving off 0, O, and I on purpose to avoid confusing users.
    charSet: 'ABCDEFGHJKLMNPQRSTUVWXYZ123456789',
    period,
  })
  const verificationData = {
    type,
    target,
    ...verificationConfig,
    expiresAt: Date.now() + verificationConfig.period * 1000,
  }
  await db
    .insert(schema.verification)
    .values(verificationData)
    .onConflictDoUpdate({
      target: [schema.verification.target, schema.verification.type],
      set: verificationData,
    })

  // add the otp to the url we'll email the user.
  verifyUrl.searchParams.set(codeQueryParam, otp)

  return { otp, redirectTo, verifyUrl }
}

export async function isCodeValid({
  code,
  type,
  target,
}: {
	code: string
	type: VerificationTypes | typeof twoFAVerifyVerificationType
	target: string
}) {
  const currentTime = Date.now()
  const verification = await db.query.verification.findFirst({
    columns: {
      algorithm: true,
      secret: true,
      period: true,
      charSet: true,
    },
    where: and(
      eq(schema.verification.target, target),
      eq(schema.verification.type, type),
      or(
        isNull(schema.verification.expiresAt),
        gt(schema.verification.expiresAt, currentTime),
      ),
    ),
  })
  if (!verification) return false
  const result = verifyTOTP({
    otp: code,
    ...verification,
  })
  if (!result) return false

  return true
}

export async function validateRequest(
  request: Request,
  body: URLSearchParams | FormData,
) {
  const submission = await parseWithZod(body, {
    schema: VerifySchema.superRefine(async (data, ctx) => {
      const codeIsValid = await isCodeValid({
        code: data[codeQueryParam],
        type: data[typeQueryParam],
        target: data[targetQueryParam],
      })
      if (!codeIsValid) {
        ctx.addIssue({
          path: ['code'],
          code: z.ZodIssueCode.custom,
          message: `Invalid code`,
        })
        return
      }
    }),
    async: true,
  })

  if (submission.status !== 'success') {
    return json(
      { result: submission.reply() },
      { status: submission.status === 'error' ? 400 : 200 },
    )
  }

  const { value: submissionValue } = submission

  async function deleteVerification() {
    await db
      .delete(schema.verification)
      .where(
        and(
          eq(schema.verification.target, submissionValue[targetQueryParam]),
          eq(schema.verification.type, submissionValue[typeQueryParam]),
        ),
      )
  }

  switch (submissionValue[typeQueryParam]) {
  case 'reset-password': {
    await deleteVerification()
    return handleResetPasswordVerification({ request, body, submission })
  }
  case 'onboarding': {
    await deleteVerification()
    return handleOnboardingVerification({ request, body, submission })
  }
  case 'change-email': {
    await deleteVerification()
    return handleChangeEmailVerification({ request, body, submission })
  }
  case '2fa': {
    return handleLoginTwoFactorVerification({ request, body, submission })
  }
  }
}
