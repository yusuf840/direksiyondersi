import { APP_NAME } from '../lib/firebase'

// Not: Bu metin bir şablondur. Yayına almadan önce bir hukukçuya kontrol ettirin.
export default function Kvkk() {
  return (
    <div className="page narrow prose">
      <h1>Kişisel Verilerin Korunması Aydınlatma Metni</h1>
      <p>{APP_NAME} üzerinden randevu aldığınızda <strong>adınız, cep telefonu numaranız, randevu bilgileriniz ve isteğe bağlı notunuz</strong> işlenir.</p>
      <h2>Amaç</h2>
      <p>Bu veriler yalnızca randevunuzun oluşturulması, işletme tarafından onaylanması, değişiklik ve iptal durumlarında sizinle iletişim kurulması amacıyla kullanılır.</p>
      <h2>Aktarım</h2>
      <p>Bilgileriniz yalnızca randevu aldığınız işletme ile paylaşılır. Veriler Google Firebase altyapısında saklanır. Veriler pazarlama amacıyla kullanılmaz ve üçüncü kişilere satılmaz.</p>
      <h2>Saklama</h2>
      <p>Randevu kayıtları, işletmenin yasal yükümlülükleri ve hizmet geçmişi için gerekli süre boyunca saklanır.</p>
      <h2>Haklarınız</h2>
      <p>6698 sayılı KVKK’nın 11. maddesi kapsamındaki haklarınızı kullanabilirsiniz. “Randevularım → Verilerimi sil” ile adınızı ve numaranızı işletme kayıtlarından kendiniz silebilirsiniz.</p>
      <p className="muted small">Veri sorumlusu: randevu aldığınız işletme. Platform işletmeci bilgileri yayın öncesi buraya eklenmelidir.</p>
    </div>
  )
}
