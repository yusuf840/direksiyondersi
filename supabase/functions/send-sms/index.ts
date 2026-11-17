// Supabase Auth "Send SMS Hook" -> Netgsm
// Supabase, doğrulama kodunu kendi göndermek yerine bu fonksiyonu çağırır; biz de Netgsm ile SMS atarız.
// Kurulum: README > "SMS (Netgsm)" bölümü.
import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0'

const HOOK_SECRET = (Deno.env.get('SEND_SMS_HOOK_SECRET') ?? '').replace('v1,whsec_', '')
const NETGSM_USER = Deno.env.get('NETGSM_USERCODE') ?? ''
const NETGSM_PASS = Deno.env.get('NETGSM_PASSWORD') ?? ''
const NETGSM_HEADER = Deno.env.get('NETGSM_MSGHEADER') ?? ''
const APP_NAME = Deno.env.get('APP_NAME') ?? 'Randevu'

Deno.serve(async (req) => {
  const body = await req.text()
  let payload: { user: { phone: string }; sms: { otp: string } }
  try {
    payload = new Webhook(HOOK_SECRET).verify(body, Object.fromEntries(req.headers)) as typeof payload
  } catch {
    return new Response(JSON.stringify({ error: { http_code: 401, message: 'invalid signature' } }), { status: 401 })
  }

  const phone = payload.user.phone.replace(/\D/g, '') // 905xxxxxxxxx
  const msg = `${APP_NAME} doğrulama kodunuz: ${payload.sms.otp}. Bu kodu kimseyle paylaşmayın.`

  const res = await fetch('https://api.netgsm.com.tr/sms/rest/v2/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + btoa(`${NETGSM_USER}:${NETGSM_PASS}`) },
    body: JSON.stringify({ msgheader: NETGSM_HEADER, encoding: 'TR', iysfilter: '0', messages: [{ msg, no: phone }] }),
  })
  const text = await res.text()
  // Netgsm başarıda {"code":"00", ...} döner
  if (!res.ok || !/"code"\s*:\s*"00"/.test(text)) {
    console.error('netgsm', res.status, text)
    return new Response(JSON.stringify({ error: { http_code: 500, message: 'SMS gönderilemedi' } }), { status: 500 })
  }
  return new Response('{}', { headers: { 'Content-Type': 'application/json' } })
})
