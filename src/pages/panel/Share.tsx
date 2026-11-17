import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { Button, Notice, useToast } from '../../components/ui'
import { usePanel } from './context'

export default function Share() {
  const { biz } = usePanel()
  const toast = useToast()
  const [q] = useSearchParams()
  const url = `${location.origin}/${biz.slug}`
  const [qr, setQr] = useState('')

  useEffect(() => { QRCode.toDataURL(url, { width: 640, margin: 2, color: { dark: '#1a3a6c' } }).then(setQr) }, [url])

  const shareText = `${biz.name} için randevunuzu buradan alabilirsiniz: ${url}`
  return (
    <div className="page narrow">
      {q.get('yeni') ? <Notice kind="success"><strong>Hazırsınız!</strong> Bu bağlantıyı müşterilerinize verin. Ayrıntıları (molalar, kapalı günler, kurallar) Ayarlar'dan düzenleyebilirsiniz.</Notice> : null}
      <h1>Müşterilerinize ulaşın</h1>
      <div className="card stack center">
        <div className="share-url">{url.replace(/^https?:\/\//, '')}</div>
        <div className="actions center">
          <Button onClick={() => navigator.clipboard.writeText(url).then(() => toast('Kopyalandı', 'success'))}>Bağlantıyı kopyala</Button>
          {'share' in navigator ? <Button variant="secondary" onClick={() => navigator.share({ title: biz.name, text: shareText, url }).catch(() => {})}>Paylaş</Button> : null}
          <a className="btn btn-wa" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer">WhatsApp</a>
        </div>
        {qr ? <img className="qr" src={qr} alt={`${biz.name} randevu QR kodu`} /> : null}
        {qr ? <a className="btn btn-ghost" href={qr} download={`${biz.slug}-qr.png`}>QR kodu indir</a> : null}
      </div>
      <div className="card">
        <div className="card-title">Nereye koyabilirsiniz?</div>
        <ul className="bullets">
          <li>WhatsApp “Hakkımda” ve otomatik karşılama mesajı</li>
          <li>Instagram biyografi bağlantısı, Google İşletme profili</li>
          <li>QR'ı kasaya, kapıya, kartvizite</li>
          <li>Telefonla arayanlara: “Linki atıyorum, boş saati oradan seçin”</li>
        </ul>
        <p className="muted small">Müşteri bağlantıyı açıp “Ana ekrana ekle” derse, uygulama her açılışta doğrudan sizin sayfanızla açılır.</p>
      </div>
    </div>
  )
}
