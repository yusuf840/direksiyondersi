const MESSAGES: Record<string, string> = {
  SLOT_TAKEN: 'Bu saat az önce doldu. Lütfen başka bir saat seçin.',
  CUSTOMER_OVERLAP: 'Bu saatle çakışan başka bir randevunuz var.',
  ACTIVE_LIMIT: 'Bu işletmede açık randevu sınırına ulaştınız. Mevcut randevunuz geçince ya da iptal edince yenisini alabilirsiniz.',
  WEEKLY_LIMIT: 'Bu hafta için alabileceğiniz randevu sınırına ulaştınız.',
  BLOCKED: 'Bu işletmeden çevrim içi randevu alamıyorsunuz. Lütfen işletmeyle iletişime geçin.',
  CONSENT_REQUIRED: 'Devam etmek için aydınlatma metnini onaylamanız gerekiyor.',
  NAME_REQUIRED: 'Lütfen adınızı girin.',
  INVALID_NAME: 'Ad en az 2 karakter olmalı.',
  AUTH_REQUIRED: 'Lütfen telefon numaranızla giriş yapın.',
  PHONE_REQUIRED: 'Lütfen telefon numaranızla giriş yapın.',
  BUSINESS_NOT_FOUND: 'İşletme bulunamadı ya da şu an randevu almıyor.',
  SERVICE_NOT_FOUND: 'Bu hizmet artık sunulmuyor.',
  CANCEL_TOO_LATE: 'İptal süresi geçti. Lütfen işletmeyi arayın.',
  NOT_CANCELLABLE: 'Bu randevu iptal edilemez.',
  NOT_FOUND: 'Kayıt bulunamadı.',
  SLUG_TAKEN: 'Bu bağlantı adı alınmış, başka bir tane deneyin.',
  SLUG_RESERVED: 'Bu bağlantı adı kullanılamaz.',
  HOURS_REQUIRED: 'En az bir çalışma günü ve saati girin.',
  TOO_MANY_BUSINESSES: 'En fazla 5 işletme oluşturabilirsiniz.',
  INVITE_INVALID: 'Davet bağlantısı geçersiz ya da süresi dolmuş.',
  FORBIDDEN: 'Bu işlem için yetkiniz yok.',
  RESOURCE_NOT_FOUND: 'Seçilen kaynak bulunamadı.',
  CUSTOMER_NOT_FOUND: 'Müşteri bulunamadı.',
}

export function errText(e: unknown): string {
  const raw = (e as { message?: string })?.message ?? String(e)
  for (const code of Object.keys(MESSAGES)) if (raw.includes(code)) return MESSAGES[code]
  if (/rate limit|too many/i.test(raw)) return 'Çok fazla deneme yapıldı. Biraz bekleyip tekrar deneyin.'
  if (/token has expired|invalid/i.test(raw) && /otp|token/i.test(raw)) return 'Kod hatalı ya da süresi dolmuş.'
  if (/Failed to fetch|NetworkError/i.test(raw)) return 'Bağlantı yok. İnternetinizi kontrol edin.'
  if (/duplicate key.*slug/i.test(raw)) return MESSAGES.SLUG_TAKEN
  if (/violates check constraint/i.test(raw)) return 'Girilen değerlerden biri geçersiz.'
  return raw
}
