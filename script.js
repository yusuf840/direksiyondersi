// DİREKSİYON DERSİ YÖNETİM SİSTEMİ - FIREBASE ENTEGRE

// Firebase Konfigürasyonu
const firebaseConfig = {
  apiKey: "AIzaSyAXuHR-dV4kYGqZ8vQJ0wZ9fZ8vQJ0wZ9f",
  authDomain: "direksiyon-dersi-29912.firebaseapp.com",
  databaseURL: "https://direksiyon-dersi-29912-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "direksiyon-dersi-29912",
  storageBucket: "direksiyon-dersi-29912.firebasestorage.app",
  messagingSenderId: "317753012196",
  appId: "1:317753012196:web:0d5fd666a32d2fcd5021f1",
  measurementId: "G-J8S4DLMCF9"
};

// Firebase'i başlat
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

const CONFIG = {
  SLOTLAR: ["08:00", "09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00"],
  GUNLER: ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"],
  GUNLUK_MAX: 8
};

let uygunluklar = [];
let mevcutOgrenci = null;
let gunlukMaxOgrenci = CONFIG.GUNLUK_MAX;

// Firebase Veri Yönetimi
function veriYukle() {
  return new Promise((resolve, reject) => {
    database.ref('ogrenciKayitlar').once('value')
      .then((snapshot) => {
        const data = snapshot.val();
        if (data) {
          uygunluklar = Object.keys(data).map(key => ({
            id: key,
            ...data[key]
          }));
        } else {
          uygunluklar = [];
        }
        resolve(uygunluklar);
      })
      .catch((error) => {
        uygunluklar = [];
        reject(error);
      });
  });
}

function veriKaydet() {
  return new Promise((resolve, reject) => {
    const kayitlar = {};
    
    uygunluklar.forEach(kayit => {
      const id = kayit.id || kayit.ogrenciId;
      kayitlar[id] = {
        ad: kayit.ad,
        tel: kayit.tel,
        gun: kayit.gun,
        saatler: kayit.saatler,
        tip: kayit.tip,
        kayitTarihi: kayit.kayitTarihi,
        planlandi: kayit.planlandi || false,
        planlandigiSaat: kayit.planlandigiSaat || null,
        ogrenciId: kayit.ogrenciId
      };
    });
    
    database.ref('ogrenciKayitlar').set(kayitlar)
      .then(() => resolve(true))
      .catch((error) => {
        alert('❌ Firebase kayıt hatası: ' + error.message);
        reject(error);
      });
  });
}

// Realtime listener ekle
function veriDinle() {
  database.ref('ogrenciKayitlar').on('value', (snapshot) => {
    const data = snapshot.val();
    if (data) {
      uygunluklar = Object.keys(data).map(key => ({
        id: key,
        ...data[key]
      }));
    } else {
      uygunluklar = [];
    }
    
    // Hoca paneli açıksa güncelle
    if (document.getElementById('hocaTabloDiv')?.style.display !== 'none') {
      hocaPaneliYukle();
    }
    
    // Öğrenci paneli açıksa güncelle
    if (mevcutOgrenci) {
      ogrenciUygunluklariniGoster();
    }
  });
}

function ogrenciIdOlustur(ad, tel) {
  return `${ad.toLowerCase().replace(/\s+/g, '_')}_${tel}`;
}

function telefonDogrula(tel) {
  return /^05[0-9]{9}$/.test(tel);
}


function temaYukle() {
  const kayitliTema = localStorage.getItem("theme") || "light";
  document.documentElement.setAttribute("data-theme", kayitliTema);
  temaIkonGuncelle(kayitliTema);
}

function temaIkonGuncelle(tema) {
  const moonIcon = document.querySelector(".moon-icon");
  const sunIcon = document.querySelector(".sun-icon");
  
  if (tema === "dark") {
    moonIcon?.classList.remove("active");
    sunIcon?.classList.add("active");
  } else {
    sunIcon?.classList.remove("active");
    moonIcon?.classList.add("active");
  }
}

function temaToggle() {
  const mevcut = document.documentElement.getAttribute("data-theme");
  const yeni = mevcut === "dark" ? "light" : "dark";
  
  document.documentElement.setAttribute("data-theme", yeni);
  localStorage.setItem("theme", yeni);
  temaIkonGuncelle(yeni);
}


function ogrenciGiris(ad, tel, beniHatirla) {
  if (!ad || ad.length < 3) {
    return alert('❌ Ad Soyad en az 3 karakter olmalıdır!');
  }
  
  if (!telefonDogrula(tel)) {
    return alert('❌ Geçerli telefon: 05XXXXXXXXX');
  }
  
  const ogrenciId = ogrenciIdOlustur(ad, tel);
  mevcutOgrenci = { ogrenciId, ad, tel };
  
  if (beniHatirla) {
    localStorage.setItem('kayitliOgrenci', JSON.stringify(mevcutOgrenci));
  } else {
    localStorage.removeItem('kayitliOgrenci');
  }
  
  document.getElementById('ogrenciLoginDiv').style.display = 'none';
  document.getElementById('ogrenciFormDiv').style.display = 'block';
  document.getElementById('ogrenciAdi').value = ad;
  document.getElementById('telefon').value = tel;
  
  veriYukle();
  ogrenciUygunluklariniGoster();
}

function ogrenciCikis() {
  mevcutOgrenci = null;
  document.getElementById('ogrenciLoginDiv').style.display = 'block';
  document.getElementById('ogrenciFormDiv').style.display = 'none';
  document.getElementById('formUygunluk').reset();
  document.querySelectorAll('.radio-option').forEach(opt => {
    opt.style.borderColor = 'var(--border)';
    opt.style.background = 'transparent';
  });
  document.getElementById('saatSecimDiv').style.display = 'none';
}

async function uygunlukKaydet(e) {
  e.preventDefault();
  
  if (!mevcutOgrenci) return alert('❌ Lütfen önce giriş yapın!');
  
  const uygunlukTipi = document.querySelector('input[name="uygunlukTipi"]:checked')?.value;
  const gun = document.getElementById('gun').value;
  
  if (!uygunlukTipi) {
    return alert('❌ Lütfen uygunluk tipini seçin!');
  }
  
  let saatler = [];
  
  if (uygunlukTipi === 'tumGun') {
    saatler = [...CONFIG.SLOTLAR];
  } else {
    const secilenSaatler = Array.from(
      document.querySelectorAll('input[name="saatler"]:checked')
    ).map(cb => cb.value);
    
    if (secilenSaatler.length === 0) {
      return alert('❌ En az 1 saat seçin!');
    }
    
    saatler = secilenSaatler;
  }
  
  // Mevcut uygunluğu kontrol et
  const mevcutIndex = uygunluklar.findIndex(u => 
    u.ogrenciId === mevcutOgrenci.ogrenciId && u.gun === gun
  );
  
  if (mevcutIndex !== -1) {
    // Güncelle
    uygunluklar[mevcutIndex].saatler = saatler;
    uygunluklar[mevcutIndex].tip = uygunlukTipi;
    uygunluklar[mevcutIndex].kayitTarihi = new Date().toISOString();
  } else {
    // Yeni ekle
    uygunluklar.push({
      id: mevcutOgrenci.ogrenciId + '_' + gun,
      ogrenciId: mevcutOgrenci.ogrenciId,
      ad: mevcutOgrenci.ad,
      tel: mevcutOgrenci.tel,
      gun,
      saatler,
      tip: uygunlukTipi,
      kayitTarihi: new Date().toISOString(),
      planlandi: false
    });
  }
  
  try {
    await veriKaydet();
    alert('✅ Uygunluk kaydedildi!\n\n💡 Kesin randevunuz hoca tarafından oluşturulacaktır.');
    
    // Formu temizle
    document.querySelectorAll('input[name="uygunlukTipi"]').forEach(r => r.checked = false);
    document.querySelectorAll('input[name="saatler"]').forEach(cb => cb.checked = false);
    document.getElementById('saatSecimDiv').style.display = 'none';
    document.querySelectorAll('.radio-option').forEach(opt => {
      opt.style.borderColor = 'var(--border)';
      opt.style.background = 'transparent';
    });
    document.querySelectorAll('.time-checkbox').forEach(tc => {
      tc.style.borderColor = 'var(--border)';
      tc.style.background = 'var(--bg-card)';
    });
    
    ogrenciUygunluklariniGoster();
  } catch (error) {
    alert('❌ Kayıt sırasında hata: ' + error.message);
  }
}    
    ogrenciUygunluklariniGoster();
  


function ogrenciUygunluklariniGoster() {
  if (!mevcutOgrenci) return;
  
  const tbody = document.getElementById('ogrenciTabloVeri');
  const ogrenciKayitlari = uygunluklar.filter(u => u.ogrenciId === mevcutOgrenci.ogrenciId);
  
  if (ogrenciKayitlari.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-state">Henüz uygunluk bildirmediniz.</td></tr>';
    return;
  }
  
  let satirlar = [];
  
  ogrenciKayitlari.forEach((kayit) => {
    const saatStr = kayit.tip === 'tumGun' ? 
      '<span class="badge badge-success">✔ Tüm Gün</span>' : 
      kayit.saatler.sort().join(', ');
    
    const durumBadge = kayit.planlandi ? 
      '<span class="badge badge-success">✅ Planlandı</span>' : 
      '<span class="badge badge-warning">⏳ Bekliyor</span>';
    
    satirlar.push(`
      <tr>
        <td><strong>${kayit.gun}</strong></td>
        <td>${saatStr}</td>
        <td>
          <button onclick="uygunlukSil('${kayit.gun}')" class="btn btn-sm btn-danger">🗑️ Sil</button>
        </td>
      </tr>
    `);
  });
  
  tbody.innerHTML = satirlar.join('');
}

function uygunlukSil(gun) {
  if (!mevcutOgrenci) return;
  if (!confirm(`🗑️ "${gun}" günü için uygunluğu silmek istediğinize emin misiniz?`)) return;
  
  uygunluklar = uygunluklar.filter(u => 
    !(u.ogrenciId === mevcutOgrenci.ogrenciId && u.gun === gun)
  );
  
  const basarili = veriKaydet();
  if (basarili) {
    alert('✅ Silindi!');
    ogrenciUygunluklariniGoster();
  }
}


function haftalikTakvimOlustur() {
  const takvimDiv = document.getElementById('haftalikTakvim');
  if (!takvimDiv) return;

  let html = `
    <table class="takvim-table">
      <thead>
        <tr>
          <th>SAAT</th>
  `;

  CONFIG.GUNLER.forEach(gun => {
    html += `<th>${gun.toUpperCase()}</th>`;
  });

  html += `
        </tr>
      </thead>
      <tbody>
  `;

  CONFIG.SLOTLAR.forEach(saat => {
    html += `<tr><th>${saat}</th>`;
    
    CONFIG.GUNLER.forEach(gun => {
      // Bu gün ve saatte planlanan dersleri bul
      const planlananDersler = uygunluklar.filter(u => 
        u.planlandi && 
        u.gun === gun && 
        u.planlandigiSaat === saat
      );

      if (planlananDersler.length > 0) {
        html += `<td class="takvim-hucre dolu">`;
        
        planlananDersler.forEach(ders => {
          html += `
            <div class="ders-kartı">
              <span class="ogrenci-adi">${ders.ad}</span>
              <span class="ders-sure">⏱️ 1 saat</span>
              <span class="ders-telefon">📱 ${ders.tel}</span>
              <div class="ders-butonlar">
                <button class="ders-btn" onclick="event.stopPropagation(); whatsappMesajGonder('${ders.tel}', '${ders.ad}', '${gun}', '${saat}')" title="WhatsApp Gönder">
                  📱
                </button>
                <button class="ders-btn" onclick="event.stopPropagation(); dersDuzenle('${ders.ogrenciId}', '${gun}', '${saat}')" title="Düzenle">
                  ✏️
                </button>
                <button class="ders-btn btn-sil" onclick="event.stopPropagation(); dersSil('${ders.ogrenciId}', '${gun}', '${saat}')" title="Sil">
                  ❌
                </button>
              </div>
            </div>
          `;
        });
        
        html += `</td>`;
      } else {
        html += `<td class="takvim-hucre bos" onclick="hucreYonetimi('${gun}', '${saat}', false)">
          <span style="color:#999; font-size:0.8rem;">Boş</span>
        </td>`;
      }
    });
    
    html += `</tr>`;
  });

  html += `
      </tbody>
    </table>
  `;

  takvimDiv.innerHTML = html;
}

function hucreYonetimi(gun, saat, dolu) {
  if (dolu) {
    // Dolu hücre - düzenleme menüsü
  } else {
    // Boş hücre - yeni ders ekleme
    yeniDersEkle(gun, saat);
  }
}

function yeniDersEkle(gun, saat) {
  // Bu gün ve saatte uygun olan öğrencileri bul
  const uygunOgrenciler = uygunluklar.filter(u => 
    !u.planlandi && 
    u.gun === gun && 
    u.saatler.includes(saat)
  );

  if (uygunOgrenciler.length === 0) {
    alert(`⚠️ ${gun} ${saat} için uygun öğrenci yok!`);
    return;
  }

  // Öğrenci seçimi için liste oluştur
  let mesaj = `📅 ${gun} - ${saat}\n\nUygun Öğrenciler:\n\n`;
  uygunOgrenciler.forEach((ogr, idx) => {
    mesaj += `${idx + 1}. ${ogr.ad} (${ogr.tel})\n`;
  });
  mesaj += `\nKaç numaralı öğrenciyi eklemek istersiniz? (1-${uygunOgrenciler.length})`;

  const secim = prompt(mesaj);
  const secimNo = parseInt(secim);

  if (secimNo && secimNo >= 1 && secimNo <= uygunOgrenciler.length) {
    const secilenOgrenci = uygunOgrenciler[secimNo - 1];
    
    // Dersi planla
    secilenOgrenci.planlandi = true;
    secilenOgrenci.planlandigiSaat = saat;
    
    veriKaydet();
    hocaPaneliYukle();
    
    alert(`✅ ${secilenOgrenci.ad} için ders eklendi!\n${gun} ${saat}`);
  }
}

function dersDuzenle(ogrenciId, gun, saat) {
  const ders = uygunluklar.find(u => 
    u.ogrenciId === ogrenciId && 
    u.gun === gun && 
    u.planlandigiSaat === saat
  );

  if (!ders) return;

  // Modal'ı aç ve bilgileri doldur
  document.getElementById('duzenleOgrenciAdi').textContent = ders.ad;
  document.getElementById('duzenleOgrenciTel').textContent = `📱 ${ders.tel}`;
  document.getElementById('duzenleGun').value = gun;
  document.getElementById('duzenleSaat').value = saat;
  
  // Mevcut ders bilgisini sakla
  window.mevcutDuzenlemeDers = {
    ogrenciId,
    eskiGun: gun,
    eskiSaat: saat
  };
  
  document.getElementById('dersDuzenleModal').style.display = 'flex';
}

function dersDuzenleKapat() {
  document.getElementById('dersDuzenleModal').style.display = 'none';
  window.mevcutDuzenlemeDers = null;
}

function dersiKaydet() {
  if (!window.mevcutDuzenlemeDers) return;
  
  const yeniGun = document.getElementById('duzenleGun').value;
  const yeniSaat = document.getElementById('duzenleSaat').value;
  
  const ders = uygunluklar.find(u => 
    u.ogrenciId === window.mevcutDuzenlemeDers.ogrenciId && 
    u.gun === window.mevcutDuzenlemeDers.eskiGun && 
    u.planlandigiSaat === window.mevcutDuzenlemeDers.eskiSaat
  );
  
  if (!ders) {
    alert('❌ Ders bulunamadı!');
    return;
  }
  
  // Yeni konumda çakışma var mı kontrol et
  const cakisma = uygunluklar.find(u => 
    u.planlandi && 
    u.gun === yeniGun && 
    u.planlandigiSaat === yeniSaat &&
    u.ogrenciId !== window.mevcutDuzenlemeDers.ogrenciId
  );
  
  if (cakisma) {
    if (!confirm(`⚠️ ${yeniGun} ${yeniSaat} saatinde ${cakisma.ad} dersi var!\n\nYine de değiştirmek istiyor musunuz? (Diğer ders silinecek)`)) {
      return;
    }
    // Çakışan dersi kaldır
    delete cakisma.planlandi;
    delete cakisma.planlandigiSaat;
  }
  
  // Dersi güncelle
  ders.gun = yeniGun;
  ders.planlandigiSaat = yeniSaat;
  
  veriKaydet();
  dersDuzenleKapat();
  hocaPaneliYukle();
  
  alert('✅ Ders güncellendi!');
}

function dersiSil() {
  if (!window.mevcutDuzenlemeDers) return;
  
  const ders = uygunluklar.find(u => 
    u.ogrenciId === window.mevcutDuzenlemeDers.ogrenciId && 
    u.gun === window.mevcutDuzenlemeDers.eskiGun && 
    u.planlandigiSaat === window.mevcutDuzenlemeDers.eskiSaat
  );
  
  if (!ders) return;
  
  if (!confirm(`🗑️ ${ders.ad} için ${ders.gun} ${ders.planlandigiSaat} dersini silmek istediğinize emin misiniz?`)) {
    return;
  }
  
  delete ders.planlandi;
  delete ders.planlandigiSaat;
  
  veriKaydet();
  dersDuzenleKapat();
  hocaPaneliYukle();
  
  alert('✅ Ders silindi!');
}

function dersSil(ogrenciId, gun, saat) {
  const ders = uygunluklar.find(u => 
    u.ogrenciId === ogrenciId && 
    u.gun === gun && 
    u.planlandigiSaat === saat
  );

  if (!ders) return;

  if (!confirm(`🗑️ ${ders.ad} için ${gun} ${saat} dersini silmek istediğinize emin misiniz?`)) {
    return;
  }

  delete ders.planlandi;
  delete ders.planlandigiSaat;

  veriKaydet();
  hocaPaneliYukle();
  
  alert('✅ Ders silindi!');
}


function hocaGiris(e) {
  e.preventDefault();
  
  if (document.getElementById('sifre').value !== '12345') {
    return alert('❌ Şifre yanlış!');
  }
  
  localStorage.setItem('hocaGirisYapti', 'true');
  document.getElementById('hocaLoginDiv').style.display = 'none';
  document.getElementById('hocaTabloDiv').style.display = 'block';
  
  hocaPaneliYukle();
}

function hocaCikis() {
  if (!confirm('🚪 Çıkış yapmak istediğinize emin misiniz?')) return;
  localStorage.removeItem('hocaGirisYapti');
  location.reload();
}

function hocaPaneliYukle() {
  veriYukle();
  haftalikTakvimOlustur(); // Haftalık takvimi güncelle
  hocaIstatistikGoster();
  hocaTablosuGoster();
}

function hocaIstatistikGoster() {
  const toplamOgrenci = new Set(uygunluklar.map(u => u.ogrenciId)).size;
  const planlanan = uygunluklar.filter(u => u.planlandi).length;
  const planlanmayan = uygunluklar.length - planlanan;
  
  const gunSayilari = {};
  uygunluklar.forEach(u => {
    gunSayilari[u.gun] = (gunSayilari[u.gun] || 0) + 1;
  });
  
  const enYogunGun = Object.keys(gunSayilari).length ? 
    Object.keys(gunSayilari).reduce((a, b) => gunSayilari[a] > gunSayilari[b] ? a : b) : "-";
  
  document.getElementById('toplamOgrenci').textContent = toplamOgrenci;
  document.getElementById('toplamUygunluk').textContent = uygunluklar.length;
  document.getElementById('planlananDers').textContent = planlanan;
  document.getElementById('planlanmayanDers').textContent = planlanmayan;
  document.getElementById('enYogunGun').textContent = enYogunGun;
}

function hocaTablosuGoster() {
  const tbody = document.getElementById('tabloVeri');
  if (!tbody) return;
  
  if (uygunluklar.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Henüz kayıt yok.</td></tr>';
    return;
  }
  
  tbody.innerHTML = uygunluklar.map((kayit, index) => {
    const saatStr = kayit.tip === 'tumGun' ? 
      '<span class="badge badge-success">✔ Tüm Gün</span>' : 
      kayit.saatler.sort().join(', ');
    
    const durumBadge = kayit.planlandi ? 
      '<span class="badge badge-success">✅ Planlandı</span>' : 
      '<span class="badge badge-warning">⏳ Bekliyor</span>';
    
    return `
      <tr>
        <td><strong>${kayit.ad}</strong></td>
        <td>${kayit.tel}</td>
        <td><span class="badge badge-primary">${kayit.gun}</span></td>
        <td>${saatStr}</td>
        <td>${durumBadge}</td>
        <td>
          <button onclick="hocaSil(${index})" class="btn btn-sm btn-danger">🗑️ Sil</button>
        </td>
      </tr>
    `;
  }).join('');
}

function hocaSil(index) {
  if (!confirm('🗑️ Silmek istediğinize emin misiniz?')) return;
  
  uygunluklar.splice(index, 1);
  
  const basarili = veriKaydet();
  if (basarili) {
    alert('✅ Silindi!');
    hocaPaneliYukle();
  }
}

function tumKayitlariSil() {
  if (uygunluklar.length === 0) return alert('⚠️ Kayıt yok!');
  if (!confirm(`⚠️ ${uygunluklar.length} kayıt silinecek!`)) return;
  if (!confirm('🔴 Emin misiniz? Bu işlem geri alınamaz!')) return;
  
  uygunluklar = [];
  veriKaydet();
  alert('✅ Tümü silindi!');
  hocaPaneliYukle();
}


async function otomatikPlanOlustur() {
  veriYukle();
  
  if (uygunluklar.length === 0) {
    return alert('⚠️ Henüz öğrenci yok!');
  }
  
  if (!confirm(`📋 ${uygunluklar.length} uygunluk için planlama yapılacak.\n\nDevam?`)) {
    return;
  }
  
  const rapor = { basarili: [], basarisiz: [], toplam: 0 };
  const atananlar = new Set();
  const gunlukSlotKullanimi = {}; // Her gün için kullanılan slotları takip et
  
  CONFIG.GUNLER.forEach(gun => {
    gunlukSlotKullanimi[gun] = {};
    CONFIG.SLOTLAR.forEach(saat => {
      gunlukSlotKullanimi[gun][saat] = null; // null = boş
    });
  });
  
  CONFIG.GUNLER.forEach(gun => {
    let gunlukSayisi = 0;
    
    // Bu güne uygun olan öğrencileri filtrele ve sırala
    const uygunOgrenciler = uygunluklar
      .filter(u => u.gun === gun && !atananlar.has(u.ogrenciId))
      .sort((a, b) => {
        // 1. Öncelik: Az seçeneği olana
        if (a.saatler.length !== b.saatler.length) {
          return a.saatler.length - b.saatler.length;
        }
        // 2. Tie-breaker: Daha erken kayıt yapana
        return new Date(a.kayitTarihi) - new Date(b.kayitTarihi);
      });
    
    uygunOgrenciler.forEach(ogrenci => {
      if (gunlukSayisi >= gunlukMaxOgrenci) {
        rapor.basarisiz.push({
          ad: ogrenci.ad,
          tel: ogrenci.tel,
          gun,
          neden: `Günlük limit aşıldı (maks ${gunlukMaxOgrenci} öğrenci/gün)`
        });
        return;
      }
      
      // Uygun boş slot bul
      const uygunBosSlot = ogrenci.saatler.find(saat => 
        gunlukSlotKullanimi[gun][saat] === null
      );
      
      if (uygunBosSlot) {
        gunlukSlotKullanimi[gun][uygunBosSlot] = ogrenci.ogrenciId;
        gunlukSayisi++;
        atananlar.add(ogrenci.ogrenciId);
        
        // Planlandı olarak işaretle
        ogrenci.planlandi = true;
        ogrenci.planlandigiSaat = uygunBosSlot;
        
        rapor.basarili.push({
          ad: ogrenci.ad,
          tel: ogrenci.tel,
          gun,
          saat: uygunBosSlot
        });
      } else {
        // Detaylı neden bul
        let detayliNeden = '';
        
        if (ogrenci.saatler.length === 1) {
          const tekSaat = ogrenci.saatler[0];
          const kullanan = gunlukSlotKullanimi[gun][tekSaat];
          if (kullanan) {
            const digerOgrenci = uygunluklar.find(u => u.ogrenciId === kullanan);
            detayliNeden = `Seçtiği tek saat (${tekSaat}) ${digerOgrenci ? digerOgrenci.ad : 'başka öğrenci'} tarafından alındı`;
          } else {
            detayliNeden = `Seçtiği saat (${tekSaat}) uygun değil`;
          }
        } else {
          const alinanSaatler = ogrenci.saatler.filter(s => gunlukSlotKullanimi[gun][s] !== null);
          detayliNeden = `Tüm seçtiği saatler dolu (${ogrenci.saatler.length} saatten ${alinanSaatler.length}'i alındı)`;
        }
        
        rapor.basarisiz.push({
          ad: ogrenci.ad,
          tel: ogrenci.tel,
          gun,
          neden: detayliNeden,
          secilenSaatler: ogrenci.saatler.join(', ')
        });
      }
    });
  });
  
  rapor.toplam = rapor.basarili.length + rapor.basarisiz.length;
  
  try {
    await veriKaydet();
    planlamaRaporuGoster(rapor);
    hocaPaneliYukle();
  } catch (error) {
    alert('❌ Planlama kaydetme hatası: ' + error.message);
  }
}

function planlamaRaporuGoster(rapor) {
  // Haftalık takvimi hemen güncelle
  haftalikTakvimOlustur();
  
  // Planlanamayan öğrencileri göster
  const planlanmayanBolum = document.getElementById('planlanmayanBolum');
  const planlanmayanListe = document.getElementById('planlanmayanListe');
  const planlanmayanSayisi = document.getElementById('planlanmayanSayisi');
  
  if (rapor.basarisiz.length > 0) {
    planlanmayanBolum.style.display = 'block';
    planlanmayanSayisi.textContent = rapor.basarisiz.length;
    
    let html = '';
    rapor.basarisiz.forEach((r, index) => {
      // Öğrencinin ID'sini bul
      const ogrenci = uygunluklar.find(u => u.ad === r.ad && u.tel === r.tel && u.gun === r.gun);
      const ogrenciId = ogrenci ? ogrenci.ogrenciId : null;
      
      html += `
        <div class="planlanan-item">
          <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:0.5rem;">
            <strong style="font-size:1rem;">${r.ad}</strong>
            <span style="font-size:0.85rem; color:var(--text-secondary);">📱 ${r.tel}</span>
          </div>
          <div style="background:rgba(251,191,36,0.15); padding:0.5rem; border-radius:4px; margin-bottom:0.5rem;">
            <div style="font-size:0.9rem; color:var(--text-primary); margin-bottom:0.25rem;">
              📅 <strong>${r.gun}</strong>
            </div>
            <div style="font-size:0.85rem; color:#dc3545;">
              ⚠️ ${r.neden}
            </div>
            ${r.secilenSaatler ? `<div style="font-size:0.8rem; color:var(--text-secondary); margin-top:0.25rem;">
              Seçtiği saatler: ${r.secilenSaatler}
            </div>` : ''}
          </div>
          ${ogrenciId ? `
          <button onclick="planlanmayanDuzenle('${ogrenciId}', '${r.ad}', '${r.tel}', '${r.gun}')" class="btn btn-warning" style="width:100%; padding:0.6rem; margin-top:0.5rem;">
            ✏️ Düzenle & Programa Ekle
          </button>
          ` : ''}
        </div>
      `;
    });
    
    planlanmayanListe.innerHTML = html;
    planlanmayanListe.style.display = 'block'; // Otomatik aç
    document.getElementById('planlanmayanToggleText').textContent = 'Gizle';
  } else {
    planlanmayanBolum.style.display = 'none';
  }
  
  // Küçük bildirim göster
  const mesaj = `✅ Planlama tamamlandı!\n\n📊 Toplam: ${rapor.toplam}\n✅ Planlanan: ${rapor.basarili.length}\n❌ Planlanamayan: ${rapor.basarisiz.length}`;
  
  alert(mesaj);
}

function whatsappMesajGonder(tel, ad, gun, saat) {
  document.getElementById('whatsappOgrenciAdi').textContent = ad;
  document.getElementById('whatsappGun').textContent = gun;
  document.getElementById('whatsappSaat').textContent = saat;
  document.getElementById('whatsappTelefon').value = tel;
  
  const varsayilanMesaj = `Merhaba ${ad},

Direksiyon dersiniz:
📅 ${gun}
⏰ ${saat}

Saygılarımla,
Sürücü Kursu`;
  
  document.getElementById('whatsappMesaj').value = varsayilanMesaj;
  document.getElementById('whatsappModal').style.display = 'flex';
}

function whatsappModalKapat() {
  document.getElementById('whatsappModal').style.display = 'none';
}

function whatsappGonder() {
  const tel = document.getElementById('whatsappTelefon').value;
  const mesaj = document.getElementById('whatsappMesaj').value;
  
  if (!tel || !mesaj) {
    alert('❌ Telefon veya mesaj boş olamaz!');
    return;
  }
  
  // Sadece rakamları al
  let temizTel = tel.replace(/\D/g, '');
  
  console.log('Orijinal Tel:', tel);
  console.log('Temizlenmiş Tel:', temizTel);
  
  // Türkiye formatına çevir
  if (temizTel.startsWith('0')) {
    // 05321234567 (11 hane) → 5321234567 (10 hane)
    temizTel = temizTel.substring(1);
  } else if (temizTel.startsWith('90')) {
    // 905321234567 (12 hane) → 5321234567 (10 hane)
    temizTel = temizTel.substring(2);
  } else if (temizTel.startsWith('5')) {
    // 5321234567 (10 hane) → doğru
    temizTel = temizTel;
  } else {
    alert('❌ Geçersiz telefon numarası!\nDoğru format: 05XX XXX XXXX');
    return;
  }
  
  // 10 haneli olmalı
  if (temizTel.length !== 10) {
    alert(`❌ Telefon numarası 10 haneli olmalı!\nŞu anda: ${temizTel.length} hane\nNumara: ${temizTel}`);
    return;
  }
  
  // Başına 90 ekle
  const uluslararasiTel = '90' + temizTel;
  
  console.log('Son Tel:', uluslararasiTel);
  
  // WhatsApp Web URL'si
  const whatsappUrl = `https://wa.me/${uluslararasiTel}?text=${encodeURIComponent(mesaj)}`;
  
  console.log('WhatsApp URL:', whatsappUrl);
  
  // Yeni sekmede aç
  window.open(whatsappUrl, '_blank');
  
  whatsappModalKapat();
}

function mesajSablonSec(sablon) {
  const ad = document.getElementById('whatsappOgrenciAdi').textContent;
  const gun = document.getElementById('whatsappGun').textContent;
  const saat = document.getElementById('whatsappSaat').textContent;
  
  let mesaj = '';
  
  switch(sablon) {
    case 'hatirlatma':
      mesaj = `Merhaba ${ad},

📢 DERS HATIRLATMASI

Yarınki dersinizi hatırlatmak istedim:
📅 ${gun}
⏰ ${saat}

Görüşmek üzere! 🚗`;
      break;
      
    case 'onay':
      mesaj = `Merhaba ${ad},

✅ DERSİNİZ ONAYLANDI

📅 Gün: ${gun}
⏰ Saat: ${saat}
📍 Adres: [Kurs adresi]

Saygılarımla,
Sürücü Kursu`;
      break;
      
    case 'iptal':
      mesaj = `Merhaba ${ad},

⚠️ DERS İPTALİ

Maalesef ${gun} günü ${saat} dersimizi iptal etmek zorundayız.

Yeni tarih için lütfen bize dönüş yapın.

Özür dileriz.`;
      break;
      
    case 'degisiklik':
      mesaj = `Merhaba ${ad},

🔄 DERS SAATİ DEĞİŞTİ

Yeni ders saatiniz:
📅 ${gun}
⏰ ${saat}

Onaylıyor musunuz?`;
      break;
      
    default:
      mesaj = `Merhaba ${ad},

Direksiyon dersiniz:
📅 ${gun}
⏰ ${saat}

Saygılarımla,
Sürücü Kursu`;
  }
  
  document.getElementById('whatsappMesaj').value = mesaj;
}

function detaylariGoster() {
  document.getElementById('detaylarModal').style.display = 'flex';
  hocaIstatistikGoster();
  hocaTablosuGoster();
}

function detaylariKapat() {
  document.getElementById('detaylarModal').style.display = 'none';
}

function ayarlariGoster() {
  document.getElementById('ayarlarModal').style.display = 'flex';
}

function ayarlariKapat() {
  document.getElementById('ayarlarModal').style.display = 'none';
}

function planlanmayanToggle() {
  const liste = document.getElementById('planlanmayanListe');
  const toggleText = document.getElementById('planlanmayanToggleText');
  
  if (liste.style.display === 'none') {
    liste.style.display = 'block';
    toggleText.textContent = 'Gizle';
  } else {
    liste.style.display = 'none';
    toggleText.textContent = 'Göster';
  }
}

// Planlanamayan öğrenci düzenleme
let mevcutPlanlanmayanOgrenci = null;

function planlanmayanDuzenle(ogrenciId, ad, tel, mevcutGun) {
  // Öğrenciyi bul
  const ogrenci = uygunluklar.find(u => u.ogrenciId === ogrenciId && u.gun === mevcutGun);
  
  if (!ogrenci) {
    alert('❌ Öğrenci bulunamadı!');
    return;
  }
  
  mevcutPlanlanmayanOgrenci = {
    ogrenciId: ogrenciId,
    ad: ad,
    tel: tel,
    eskiGun: mevcutGun
  };
  
  // Modal'ı doldur
  document.getElementById('planlanmayanDuzenleAd').textContent = ad;
  document.getElementById('planlanmayanDuzenleTel').textContent = `📱 ${tel}`;
  document.getElementById('planlanmayanDuzenleGun').value = mevcutGun;
  document.getElementById('planlanmayanDuzenleSaat').value = CONFIG.SLOTLAR[0]; // İlk saati seç
  
  // Modal'ı aç
  document.getElementById('planlanmayanDuzenleModal').style.display = 'flex';
}

function planlanmayanDuzenleKapat() {
  document.getElementById('planlanmayanDuzenleModal').style.display = 'none';
  mevcutPlanlanmayanOgrenci = null;
}

async function planlanmayanKaydet() {
  if (!mevcutPlanlanmayanOgrenci) {
    alert('❌ Hata: Öğrenci bilgisi bulunamadı!');
    return;
  }
  
  const yeniGun = document.getElementById('planlanmayanDuzenleGun').value;
  const yeniSaat = document.getElementById('planlanmayanDuzenleSaat').value;
  
  // Seçilen slot'un dolu olup olmadığını kontrol et
  const slotDoluMu = uygunluklar.some(u => 
    u.gun === yeniGun && 
    u.planlandi === true && 
    u.planlandigiSaat === yeniSaat
  );
  
  if (slotDoluMu) {
    if (!confirm(`⚠️ ${yeniGun} günü ${yeniSaat} saati başka bir öğrenci tarafından kullanılıyor!\n\nYine de eklemek ister misiniz?`)) {
      return;
    }
  }
  
  // Eski kaydı bul ve güncelle
  const eskiKayit = uygunluklar.find(u => 
    u.ogrenciId === mevcutPlanlanmayanOgrenci.ogrenciId && 
    u.gun === mevcutPlanlanmayanOgrenci.eskiGun
  );
  
  if (eskiKayit) {
    // Günü güncelle
    eskiKayit.gun = yeniGun;
    eskiKayit.planlandi = true;
    eskiKayit.planlandigiSaat = yeniSaat;
    eskiKayit.saatler = [yeniSaat]; // Yeni saati ekle
    
    try {
      await veriKaydet();
      alert(`✅ Başarılı!\n\n${mevcutPlanlanmayanOgrenci.ad} isimli öğrenci ${yeniGun} günü ${yeniSaat} saatine eklendi.`);
      
      planlanmayanDuzenleKapat();
      hocaPaneliYukle();
    } catch (error) {
      alert('❌ Kayıt sırasında hata: ' + error.message);
    }
  } else {
    alert('❌ Öğrenci kaydı bulunamadı!');
  }
}

// Modal dışına tıklayınca kapat
document.addEventListener('click', function(e) {
  if (e.target.classList.contains('modal')) {
    e.target.style.display = 'none';
  }
});

function planlamaTemizle() {
  if (!confirm('🔄 Tüm planlamayı sıfırlamak istediğinize emin misiniz?')) return;
  
  uygunluklar.forEach(u => {
    delete u.planlandi;
    delete u.planlandigiSaat;
  });
  
  veriKaydet();
  alert('✅ Planlama sıfırlandı!');
  hocaPaneliYukle();
}


function pdfIndir() {
  if (uygunluklar.length === 0) return alert('⚠️ Kayıt yok!');
  
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  doc.setFontSize(16);
  doc.text("Ders Programı", 105, 15, { align: 'center' });
  
  doc.autoTable({
    startY: 30,
    head: [["Öğrenci", "Telefon", "Gün", "Saatler", "Durum"]],
    body: uygunluklar.map(k => [
      k.ad, 
      k.tel, 
      k.gun, 
      k.tip === 'tumGun' ? 'Tüm Gün' : k.saatler.join(', '),
      k.planlandi ? 'Planlandı' : 'Bekliyor'
    ])
  });
  
  doc.save(`ders_programi_${new Date().toLocaleDateString('tr-TR')}.pdf`);
}

function excelIndir() {
  if (uygunluklar.length === 0) return alert('⚠️ Kayıt yok!');
  
  const ws_data = [
    ["Öğrenci", "Telefon", "Gün", "Saatler", "Durum"],
    ...uygunluklar.map(k => [
      k.ad,
      k.tel,
      k.gun,
      k.tip === 'tumGun' ? 'Tüm Gün' : k.saatler.join(', '),
      k.planlandi ? 'Planlandı' : 'Bekliyor'
    ])
  ];
  
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(ws_data);
  ws['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 12 }, { wch: 30 }, { wch: 12 }];
  
  XLSX.utils.book_append_sheet(wb, ws, "Program");
  XLSX.writeFile(wb, `ders_programi_${new Date().toLocaleDateString('tr-TR')}.xlsx`);
}


function kayitAra() {
  const val = document.getElementById('searchInput').value.toLowerCase();
  document.querySelectorAll('#tabloVeri tr').forEach(r => {
    const text = r.textContent.toLowerCase();
    r.style.display = text.includes(val) ? '' : 'none';
  });
}


document.addEventListener('DOMContentLoaded', async function() {
  temaYukle();
  
  // Firebase'den veri yükle ve dinlemeye başla
  try {
    await veriYukle();
    veriDinle(); // Realtime updates için
  } catch (error) {
    alert('⚠️ Veri yükleme hatası: ' + error.message);
  }
  
  // Tema butonu
  document.getElementById('themeToggle')?.addEventListener('click', temaToggle);
  
  // Panel değiştirme
  document.getElementById('ogrenciBtn')?.addEventListener('click', () => {
    document.getElementById('ogrenciPanel').style.display = 'block';
    document.getElementById('hocaPanel').style.display = 'none';
    document.getElementById('ogrenciBtn').classList.add('active');
    document.getElementById('hocaBtn').classList.remove('active');
  });
  
  document.getElementById('hocaBtn')?.addEventListener('click', () => {
    document.getElementById('ogrenciPanel').style.display = 'none';
    document.getElementById('hocaPanel').style.display = 'block';
    document.getElementById('ogrenciBtn').classList.remove('active');
    document.getElementById('hocaBtn').classList.add('active');
  });
  
  // Öğrenci giriş
  document.getElementById('ogrenciLoginForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const ad = document.getElementById('loginAdSoyad').value.trim();
    const tel = document.getElementById('loginTelefon').value.trim();
    const beniHatirla = document.getElementById('beniHatirla').checked;
    ogrenciGiris(ad, tel, beniHatirla);
  });
  
  document.getElementById('farkliHesapBtn')?.addEventListener('click', function() {
    if (confirm('💭 Kayıtlı bilgileri silmek istediğinize emin misiniz?')) {
      localStorage.removeItem('kayitliOgrenci');
      document.getElementById('loginAdSoyad').value = '';
      document.getElementById('loginTelefon').value = '';
      document.getElementById('beniHatirla').checked = false;
      this.style.display = 'none';
      alert('✅ Silindi!');
    }
  });
  
  // Uygunluk kaydet
  document.getElementById('formUygunluk')?.addEventListener('submit', uygunlukKaydet);
  
  // Radio değişimi
  document.querySelectorAll('input[name="uygunlukTipi"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const saatSecimDiv = document.getElementById('saatSecimDiv');
      const tumGunLabel = document.getElementById('tumGunLabel');
      const saatBazliLabel = document.getElementById('saatBazliLabel');
      
      document.querySelectorAll('.radio-option').forEach(opt => {
        opt.style.borderColor = 'var(--border)';
        opt.style.background = 'transparent';
      });
      
      if (e.target.value === 'saatBazli') {
        saatSecimDiv.style.display = 'block';
        saatBazliLabel.style.borderColor = 'var(--primary)';
        saatBazliLabel.style.background = 'rgba(30, 58, 95, 0.05)';
      } else {
        saatSecimDiv.style.display = 'none';
        tumGunLabel.style.borderColor = 'var(--primary)';
        tumGunLabel.style.background = 'rgba(30, 58, 95, 0.05)';
        document.querySelectorAll('input[name="saatler"]').forEach(cb => cb.checked = false);
        document.querySelectorAll('.time-checkbox').forEach(tc => {
          tc.style.borderColor = 'var(--border)';
          tc.style.background = 'var(--bg-card)';
        });
      }
    });
  });
  
  // Checkbox stilleri
  document.querySelectorAll('.time-checkbox input[type="checkbox"]').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const label = e.target.closest('.time-checkbox');
      if (e.target.checked) {
        label.style.borderColor = 'var(--primary)';
        label.style.background = 'rgba(30, 58, 95, 0.1)';
      } else {
        label.style.borderColor = 'var(--border)';
        label.style.background = 'var(--bg-card)';
      }
    });
  });
  
  // Hoca giriş
  document.getElementById('hocaLoginForm')?.addEventListener('submit', hocaGiris);
  
  // Hoca arama
  document.getElementById('searchInput')?.addEventListener('input', kayitAra);
  
  // Beni hatırla kontrolü
  const kayitliOgrenci = localStorage.getItem('kayitliOgrenci');
  if (kayitliOgrenci) {
    const { ad, tel } = JSON.parse(kayitliOgrenci);
    document.getElementById('loginAdSoyad').value = ad;
    document.getElementById('loginTelefon').value = tel;
    document.getElementById('beniHatirla').checked = true;
    document.getElementById('farkliHesapBtn').style.display = 'block';
  }
  
  // Hoca otomatik giriş
  if (localStorage.getItem('hocaGirisYapti') === 'true') {
    document.getElementById('ogrenciPanel').style.display = 'none';
    document.getElementById('hocaPanel').style.display = 'block';
    document.getElementById('ogrenciBtn').classList.remove('active');
    document.getElementById('hocaBtn').classList.add('active');
    document.getElementById('hocaLoginDiv').style.display = 'none';
    document.getElementById('hocaTabloDiv').style.display = 'block';
    hocaPaneliYukle();
  } else {
    document.getElementById('ogrenciPanel').style.display = 'block';
    document.getElementById('hocaPanel').style.display = 'none';
    document.getElementById('ogrenciBtn').classList.add('active');
  }
});

// Global fonksiyonlar
window.uygunlukSil = uygunlukSil;
window.hocaSil = hocaSil;
window.hocaCikis = hocaCikis;
window.ogrenciCikis = ogrenciCikis;
window.otomatikPlanOlustur = otomatikPlanOlustur;
window.planlamaTemizle = planlamaTemizle;
window.tumKayitlariSil = tumKayitlariSil;
window.hucreYonetimi = hucreYonetimi;
window.yeniDersEkle = yeniDersEkle;
window.dersDuzenle = dersDuzenle;
window.dersSil = dersSil;
window.detaylariGoster = detaylariGoster;
window.detaylariKapat = detaylariKapat;
window.ayarlariGoster = ayarlariGoster;
window.ayarlariKapat = ayarlariKapat;
window.planlanmayanToggle = planlanmayanToggle;
window.pdfIndir = pdfIndir;
window.excelIndir = excelIndir;
window.dersDuzenleKapat = dersDuzenleKapat;
window.dersiKaydet = dersiKaydet;
window.dersiSil = dersiSil;
window.whatsappMesajGonder = whatsappMesajGonder;
window.whatsappModalKapat = whatsappModalKapat;
window.whatsappGonder = whatsappGonder;
window.mesajSablonSec = mesajSablonSec;
window.planlanmayanDuzenle = planlanmayanDuzenle;
window.planlanmayanDuzenleKapat = planlanmayanDuzenleKapat;
window.planlanmayanKaydet = planlanmayanKaydet;// DİREKSİYON DERSİ YÖNETİM SİSTEMİ - FIREBASE ENTEGRE

// Firebase Konfigürasyonu
const firebaseConfig = {
  apiKey: "AIzaSyAXuHR-dV4kYGqZ8vQJ0wZ9fZ8vQJ0wZ9f",
  authDomain: "direksiyon-dersi-29912.firebaseapp.com",
  databaseURL: "https://direksiyon-dersi-29912-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "direksiyon-dersi-29912",
  storageBucket: "direksiyon-dersi-29912.firebasestorage.app",
  messagingSenderId: "317753012196",
  appId: "1:317753012196:web:0d5fd666a32d2fcd5021f1",
  measurementId: "G-J8S4DLMCF9"
};

// Firebase'i başlat
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

const CONFIG = {
  SLOTLAR: ["08:00", "09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00"],
  GUNLER: ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"],
  GUNLUK_MAX: 8
};

let uygunluklar = [];
let mevcutOgrenci = null;
let gunlukMaxOgrenci = CONFIG.GUNLUK_MAX;

// Firebase Veri Yönetimi
function veriYukle() {
  return new Promise((resolve, reject) => {
    database.ref('ogrenciKayitlar').once('value')
      .then((snapshot) => {
        const data = snapshot.val();
        if (data) {
          uygunluklar = Object.keys(data).map(key => ({
            id: key,
            ...data[key]
          }));
        } else {
          uygunluklar = [];
        }
        resolve(uygunluklar);
      })
      .catch((error) => {
        uygunluklar = [];
        reject(error);
      });
  });
}

function veriKaydet() {
  return new Promise((resolve, reject) => {
    const kayitlar = {};
    
    uygunluklar.forEach(kayit => {
      const id = kayit.id || kayit.ogrenciId;
      kayitlar[id] = {
        ad: kayit.ad,
        tel: kayit.tel,
        gun: kayit.gun,
        saatler: kayit.saatler,
        tip: kayit.tip,
        kayitTarihi: kayit.kayitTarihi,
        planlandi: kayit.planlandi || false,
        planlandigiSaat: kayit.planlandigiSaat || null,
        ogrenciId: kayit.ogrenciId
      };
    });
    
    database.ref('ogrenciKayitlar').set(kayitlar)
      .then(() => resolve(true))
      .catch((error) => {
        alert('❌ Firebase kayıt hatası: ' + error.message);
        reject(error);
      });
  });
}

// Realtime listener ekle
function veriDinle() {
  database.ref('ogrenciKayitlar').on('value', (snapshot) => {
    const data = snapshot.val();
    if (data) {
      uygunluklar = Object.keys(data).map(key => ({
        id: key,
        ...data[key]
      }));
    } else {
      uygunluklar = [];
    }
    
    // Hoca paneli açıksa güncelle
    if (document.getElementById('hocaTabloDiv')?.style.display !== 'none') {
      hocaPaneliYukle();
    }
    
    // Öğrenci paneli açıksa güncelle
    if (mevcutOgrenci) {
      ogrenciUygunluklariniGoster();
    }
  });
}

function ogrenciIdOlustur(ad, tel) {
  return `${ad.toLowerCase().replace(/\s+/g, '_')}_${tel}`;
}

function telefonDogrula(tel) {
  return /^05[0-9]{9}$/.test(tel);
}


function temaYukle() {
  const kayitliTema = localStorage.getItem("theme") || "light";
  document.documentElement.setAttribute("data-theme", kayitliTema);
  temaIkonGuncelle(kayitliTema);
}

function temaIkonGuncelle(tema) {
  const moonIcon = document.querySelector(".moon-icon");
  const sunIcon = document.querySelector(".sun-icon");
  
  if (tema === "dark") {
    moonIcon?.classList.remove("active");
    sunIcon?.classList.add("active");
  } else {
    sunIcon?.classList.remove("active");
    moonIcon?.classList.add("active");
  }
}

function temaToggle() {
  const mevcut = document.documentElement.getAttribute("data-theme");
  const yeni = mevcut === "dark" ? "light" : "dark";
  
  document.documentElement.setAttribute("data-theme", yeni);
  localStorage.setItem("theme", yeni);
  temaIkonGuncelle(yeni);
}


function ogrenciGiris(ad, tel, beniHatirla) {
  if (!ad || ad.length < 3) {
    return alert('❌ Ad Soyad en az 3 karakter olmalıdır!');
  }
  
  if (!telefonDogrula(tel)) {
    return alert('❌ Geçerli telefon: 05XXXXXXXXX');
  }
  
  const ogrenciId = ogrenciIdOlustur(ad, tel);
  mevcutOgrenci = { ogrenciId, ad, tel };
  
  if (beniHatirla) {
    localStorage.setItem('kayitliOgrenci', JSON.stringify(mevcutOgrenci));
  } else {
    localStorage.removeItem('kayitliOgrenci');
  }
  
  document.getElementById('ogrenciLoginDiv').style.display = 'none';
  document.getElementById('ogrenciFormDiv').style.display = 'block';
  document.getElementById('ogrenciAdi').value = ad;
  document.getElementById('telefon').value = tel;
  
  veriYukle();
  ogrenciUygunluklariniGoster();
}

function ogrenciCikis() {
  mevcutOgrenci = null;
  document.getElementById('ogrenciLoginDiv').style.display = 'block';
  document.getElementById('ogrenciFormDiv').style.display = 'none';
  document.getElementById('formUygunluk').reset();
  document.querySelectorAll('.radio-option').forEach(opt => {
    opt.style.borderColor = 'var(--border)';
    opt.style.background = 'transparent';
  });
  document.getElementById('saatSecimDiv').style.display = 'none';
}

async function uygunlukKaydet(e) {
  e.preventDefault();
  
  if (!mevcutOgrenci) return alert('❌ Lütfen önce giriş yapın!');
  
  const uygunlukTipi = document.querySelector('input[name="uygunlukTipi"]:checked')?.value;
  const gun = document.getElementById('gun').value;
  
  if (!uygunlukTipi) {
    return alert('❌ Lütfen uygunluk tipini seçin!');
  }
  
  let saatler = [];
  
  if (uygunlukTipi === 'tumGun') {
    saatler = [...CONFIG.SLOTLAR];
  } else {
    const secilenSaatler = Array.from(
      document.querySelectorAll('input[name="saatler"]:checked')
    ).map(cb => cb.value);
    
    if (secilenSaatler.length === 0) {
      return alert('❌ En az 1 saat seçin!');
    }
    
    saatler = secilenSaatler;
  }
  
  // Mevcut uygunluğu kontrol et
  const mevcutIndex = uygunluklar.findIndex(u => 
    u.ogrenciId === mevcutOgrenci.ogrenciId && u.gun === gun
  );
  
  if (mevcutIndex !== -1) {
    // Güncelle
    uygunluklar[mevcutIndex].saatler = saatler;
    uygunluklar[mevcutIndex].tip = uygunlukTipi;
    uygunluklar[mevcutIndex].kayitTarihi = new Date().toISOString();
  } else {
    // Yeni ekle
    uygunluklar.push({
      id: mevcutOgrenci.ogrenciId + '_' + gun,
      ogrenciId: mevcutOgrenci.ogrenciId,
      ad: mevcutOgrenci.ad,
      tel: mevcutOgrenci.tel,
      gun,
      saatler,
      tip: uygunlukTipi,
      kayitTarihi: new Date().toISOString(),
      planlandi: false
    });
  }
  
  try {
    await veriKaydet();
    alert('✅ Uygunluk kaydedildi!\n\n💡 Kesin randevunuz hoca tarafından oluşturulacaktır.');
    
    // Formu temizle
    document.querySelectorAll('input[name="uygunlukTipi"]').forEach(r => r.checked = false);
    document.querySelectorAll('input[name="saatler"]').forEach(cb => cb.checked = false);
    document.getElementById('saatSecimDiv').style.display = 'none';
    document.querySelectorAll('.radio-option').forEach(opt => {
      opt.style.borderColor = 'var(--border)';
      opt.style.background = 'transparent';
    });
    document.querySelectorAll('.time-checkbox').forEach(tc => {
      tc.style.borderColor = 'var(--border)';
      tc.style.background = 'var(--bg-card)';
    });
    
    ogrenciUygunluklariniGoster();
  } catch (error) {
    alert('❌ Kayıt sırasında hata: ' + error.message);
  }
}    
    ogrenciUygunluklariniGoster();
  


function ogrenciUygunluklariniGoster() {
  if (!mevcutOgrenci) return;
  
  const tbody = document.getElementById('ogrenciTabloVeri');
  const ogrenciKayitlari = uygunluklar.filter(u => u.ogrenciId === mevcutOgrenci.ogrenciId);
  
  if (ogrenciKayitlari.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-state">Henüz uygunluk bildirmediniz.</td></tr>';
    return;
  }
  
  let satirlar = [];
  
  ogrenciKayitlari.forEach((kayit) => {
    const saatStr = kayit.tip === 'tumGun' ? 
      '<span class="badge badge-success">✔ Tüm Gün</span>' : 
      kayit.saatler.sort().join(', ');
    
    const durumBadge = kayit.planlandi ? 
      '<span class="badge badge-success">✅ Planlandı</span>' : 
      '<span class="badge badge-warning">⏳ Bekliyor</span>';
    
    satirlar.push(`
      <tr>
        <td><strong>${kayit.gun}</strong></td>
        <td>${saatStr}</td>
        <td>
          <button onclick="uygunlukSil('${kayit.gun}')" class="btn btn-sm btn-danger">🗑️ Sil</button>
        </td>
      </tr>
    `);
  });
  
  tbody.innerHTML = satirlar.join('');
}

function uygunlukSil(gun) {
  if (!mevcutOgrenci) return;
  if (!confirm(`🗑️ "${gun}" günü için uygunluğu silmek istediğinize emin misiniz?`)) return;
  
  uygunluklar = uygunluklar.filter(u => 
    !(u.ogrenciId === mevcutOgrenci.ogrenciId && u.gun === gun)
  );
  
  const basarili = veriKaydet();
  if (basarili) {
    alert('✅ Silindi!');
    ogrenciUygunluklariniGoster();
  }
}


function haftalikTakvimOlustur() {
  const takvimDiv = document.getElementById('haftalikTakvim');
  if (!takvimDiv) return;

  let html = `
    <table class="takvim-table">
      <thead>
        <tr>
          <th>SAAT</th>
  `;

  CONFIG.GUNLER.forEach(gun => {
    html += `<th>${gun.toUpperCase()}</th>`;
  });

  html += `
        </tr>
      </thead>
      <tbody>
  `;

  CONFIG.SLOTLAR.forEach(saat => {
    html += `<tr><th>${saat}</th>`;
    
    CONFIG.GUNLER.forEach(gun => {
      // Bu gün ve saatte planlanan dersleri bul
      const planlananDersler = uygunluklar.filter(u => 
        u.planlandi && 
        u.gun === gun && 
        u.planlandigiSaat === saat
      );

      if (planlananDersler.length > 0) {
        html += `<td class="takvim-hucre dolu">`;
        
        planlananDersler.forEach(ders => {
          html += `
            <div class="ders-kartı">
              <span class="ogrenci-adi">${ders.ad}</span>
              <span class="ders-sure">⏱️ 1 saat</span>
              <span class="ders-telefon">📱 ${ders.tel}</span>
              <div class="ders-butonlar">
                <button class="ders-btn" onclick="event.stopPropagation(); whatsappMesajGonder('${ders.tel}', '${ders.ad}', '${gun}', '${saat}')" title="WhatsApp Gönder">
                  📱
                </button>
                <button class="ders-btn" onclick="event.stopPropagation(); dersDuzenle('${ders.ogrenciId}', '${gun}', '${saat}')" title="Düzenle">
                  ✏️
                </button>
                <button class="ders-btn btn-sil" onclick="event.stopPropagation(); dersSil('${ders.ogrenciId}', '${gun}', '${saat}')" title="Sil">
                  ❌
                </button>
              </div>
            </div>
          `;
        });
        
        html += `</td>`;
      } else {
        html += `<td class="takvim-hucre bos" onclick="hucreYonetimi('${gun}', '${saat}', false)">
          <span style="color:#999; font-size:0.8rem;">Boş</span>
        </td>`;
      }
    });
    
    html += `</tr>`;
  });

  html += `
      </tbody>
    </table>
  `;

  takvimDiv.innerHTML = html;
}

function hucreYonetimi(gun, saat, dolu) {
  if (dolu) {
    // Dolu hücre - düzenleme menüsü
  } else {
    // Boş hücre - yeni ders ekleme
    yeniDersEkle(gun, saat);
  }
}

function yeniDersEkle(gun, saat) {
  // Bu gün ve saatte uygun olan öğrencileri bul
  const uygunOgrenciler = uygunluklar.filter(u => 
    !u.planlandi && 
    u.gun === gun && 
    u.saatler.includes(saat)
  );

  if (uygunOgrenciler.length === 0) {
    alert(`⚠️ ${gun} ${saat} için uygun öğrenci yok!`);
    return;
  }

  // Öğrenci seçimi için liste oluştur
  let mesaj = `📅 ${gun} - ${saat}\n\nUygun Öğrenciler:\n\n`;
  uygunOgrenciler.forEach((ogr, idx) => {
    mesaj += `${idx + 1}. ${ogr.ad} (${ogr.tel})\n`;
  });
  mesaj += `\nKaç numaralı öğrenciyi eklemek istersiniz? (1-${uygunOgrenciler.length})`;

  const secim = prompt(mesaj);
  const secimNo = parseInt(secim);

  if (secimNo && secimNo >= 1 && secimNo <= uygunOgrenciler.length) {
    const secilenOgrenci = uygunOgrenciler[secimNo - 1];
    
    // Dersi planla
    secilenOgrenci.planlandi = true;
    secilenOgrenci.planlandigiSaat = saat;
    
    veriKaydet();
    hocaPaneliYukle();
    
    alert(`✅ ${secilenOgrenci.ad} için ders eklendi!\n${gun} ${saat}`);
  }
}

function dersDuzenle(ogrenciId, gun, saat) {
  const ders = uygunluklar.find(u => 
    u.ogrenciId === ogrenciId && 
    u.gun === gun && 
    u.planlandigiSaat === saat
  );

  if (!ders) return;

  // Modal'ı aç ve bilgileri doldur
  document.getElementById('duzenleOgrenciAdi').textContent = ders.ad;
  document.getElementById('duzenleOgrenciTel').textContent = `📱 ${ders.tel}`;
  document.getElementById('duzenleGun').value = gun;
  document.getElementById('duzenleSaat').value = saat;
  
  // Mevcut ders bilgisini sakla
  window.mevcutDuzenlemeDers = {
    ogrenciId,
    eskiGun: gun,
    eskiSaat: saat
  };
  
  document.getElementById('dersDuzenleModal').style.display = 'flex';
}

function dersDuzenleKapat() {
  document.getElementById('dersDuzenleModal').style.display = 'none';
  window.mevcutDuzenlemeDers = null;
}

function dersiKaydet() {
  if (!window.mevcutDuzenlemeDers) return;
  
  const yeniGun = document.getElementById('duzenleGun').value;
  const yeniSaat = document.getElementById('duzenleSaat').value;
  
  const ders = uygunluklar.find(u => 
    u.ogrenciId === window.mevcutDuzenlemeDers.ogrenciId && 
    u.gun === window.mevcutDuzenlemeDers.eskiGun && 
    u.planlandigiSaat === window.mevcutDuzenlemeDers.eskiSaat
  );
  
  if (!ders) {
    alert('❌ Ders bulunamadı!');
    return;
  }
  
  // Yeni konumda çakışma var mı kontrol et
  const cakisma = uygunluklar.find(u => 
    u.planlandi && 
    u.gun === yeniGun && 
    u.planlandigiSaat === yeniSaat &&
    u.ogrenciId !== window.mevcutDuzenlemeDers.ogrenciId
  );
  
  if (cakisma) {
    if (!confirm(`⚠️ ${yeniGun} ${yeniSaat} saatinde ${cakisma.ad} dersi var!\n\nYine de değiştirmek istiyor musunuz? (Diğer ders silinecek)`)) {
      return;
    }
    // Çakışan dersi kaldır
    delete cakisma.planlandi;
    delete cakisma.planlandigiSaat;
  }
  
  // Dersi güncelle
  ders.gun = yeniGun;
  ders.planlandigiSaat = yeniSaat;
  
  veriKaydet();
  dersDuzenleKapat();
  hocaPaneliYukle();
  
  alert('✅ Ders güncellendi!');
}

function dersiSil() {
  if (!window.mevcutDuzenlemeDers) return;
  
  const ders = uygunluklar.find(u => 
    u.ogrenciId === window.mevcutDuzenlemeDers.ogrenciId && 
    u.gun === window.mevcutDuzenlemeDers.eskiGun && 
    u.planlandigiSaat === window.mevcutDuzenlemeDers.eskiSaat
  );
  
  if (!ders) return;
  
  if (!confirm(`🗑️ ${ders.ad} için ${ders.gun} ${ders.planlandigiSaat} dersini silmek istediğinize emin misiniz?`)) {
    return;
  }
  
  delete ders.planlandi;
  delete ders.planlandigiSaat;
  
  veriKaydet();
  dersDuzenleKapat();
  hocaPaneliYukle();
  
  alert('✅ Ders silindi!');
}

function dersSil(ogrenciId, gun, saat) {
  const ders = uygunluklar.find(u => 
    u.ogrenciId === ogrenciId && 
    u.gun === gun && 
    u.planlandigiSaat === saat
  );

  if (!ders) return;

  if (!confirm(`🗑️ ${ders.ad} için ${gun} ${saat} dersini silmek istediğinize emin misiniz?`)) {
    return;
  }

  delete ders.planlandi;
  delete ders.planlandigiSaat;

  veriKaydet();
  hocaPaneliYukle();
  
  alert('✅ Ders silindi!');
}


function hocaGiris(e) {
  e.preventDefault();
  
  if (document.getElementById('sifre').value !== '12345') {
    return alert('❌ Şifre yanlış!');
  }
  
  localStorage.setItem('hocaGirisYapti', 'true');
  document.getElementById('hocaLoginDiv').style.display = 'none';
  document.getElementById('hocaTabloDiv').style.display = 'block';
  
  hocaPaneliYukle();
}

function hocaCikis() {
  if (!confirm('🚪 Çıkış yapmak istediğinize emin misiniz?')) return;
  localStorage.removeItem('hocaGirisYapti');
  location.reload();
}

function hocaPaneliYukle() {
  veriYukle();
  haftalikTakvimOlustur(); // Haftalık takvimi güncelle
  hocaIstatistikGoster();
  hocaTablosuGoster();
}

function hocaIstatistikGoster() {
  const toplamOgrenci = new Set(uygunluklar.map(u => u.ogrenciId)).size;
  const planlanan = uygunluklar.filter(u => u.planlandi).length;
  const planlanmayan = uygunluklar.length - planlanan;
  
  const gunSayilari = {};
  uygunluklar.forEach(u => {
    gunSayilari[u.gun] = (gunSayilari[u.gun] || 0) + 1;
  });
  
  const enYogunGun = Object.keys(gunSayilari).length ? 
    Object.keys(gunSayilari).reduce((a, b) => gunSayilari[a] > gunSayilari[b] ? a : b) : "-";
  
  document.getElementById('toplamOgrenci').textContent = toplamOgrenci;
  document.getElementById('toplamUygunluk').textContent = uygunluklar.length;
  document.getElementById('planlananDers').textContent = planlanan;
  document.getElementById('planlanmayanDers').textContent = planlanmayan;
  document.getElementById('enYogunGun').textContent = enYogunGun;
}

function hocaTablosuGoster() {
  const tbody = document.getElementById('tabloVeri');
  if (!tbody) return;
  
  if (uygunluklar.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Henüz kayıt yok.</td></tr>';
    return;
  }
  
  tbody.innerHTML = uygunluklar.map((kayit, index) => {
    const saatStr = kayit.tip === 'tumGun' ? 
      '<span class="badge badge-success">✔ Tüm Gün</span>' : 
      kayit.saatler.sort().join(', ');
    
    const durumBadge = kayit.planlandi ? 
      '<span class="badge badge-success">✅ Planlandı</span>' : 
      '<span class="badge badge-warning">⏳ Bekliyor</span>';
    
    return `
      <tr>
        <td><strong>${kayit.ad}</strong></td>
        <td>${kayit.tel}</td>
        <td><span class="badge badge-primary">${kayit.gun}</span></td>
        <td>${saatStr}</td>
        <td>${durumBadge}</td>
        <td>
          <button onclick="hocaSil(${index})" class="btn btn-sm btn-danger">🗑️ Sil</button>
        </td>
      </tr>
    `;
  }).join('');
}

function hocaSil(index) {
  if (!confirm('🗑️ Silmek istediğinize emin misiniz?')) return;
  
  uygunluklar.splice(index, 1);
  
  const basarili = veriKaydet();
  if (basarili) {
    alert('✅ Silindi!');
    hocaPaneliYukle();
  }
}

function tumKayitlariSil() {
  if (uygunluklar.length === 0) return alert('⚠️ Kayıt yok!');
  if (!confirm(`⚠️ ${uygunluklar.length} kayıt silinecek!`)) return;
  if (!confirm('🔴 Emin misiniz? Bu işlem geri alınamaz!')) return;
  
  uygunluklar = [];
  veriKaydet();
  alert('✅ Tümü silindi!');
  hocaPaneliYukle();
}


async function otomatikPlanOlustur() {
  veriYukle();
  
  if (uygunluklar.length === 0) {
    return alert('⚠️ Henüz öğrenci yok!');
  }
  
  if (!confirm(`📋 ${uygunluklar.length} uygunluk için planlama yapılacak.\n\nDevam?`)) {
    return;
  }
  
  const rapor = { basarili: [], basarisiz: [], toplam: 0 };
  const atananlar = new Set();
  const gunlukSlotKullanimi = {}; // Her gün için kullanılan slotları takip et
  
  CONFIG.GUNLER.forEach(gun => {
    gunlukSlotKullanimi[gun] = {};
    CONFIG.SLOTLAR.forEach(saat => {
      gunlukSlotKullanimi[gun][saat] = null; // null = boş
    });
  });
  
  CONFIG.GUNLER.forEach(gun => {
    let gunlukSayisi = 0;
    
    // Bu güne uygun olan öğrencileri filtrele ve sırala
    const uygunOgrenciler = uygunluklar
      .filter(u => u.gun === gun && !atananlar.has(u.ogrenciId))
      .sort((a, b) => {
        // 1. Öncelik: Az seçeneği olana
        if (a.saatler.length !== b.saatler.length) {
          return a.saatler.length - b.saatler.length;
        }
        // 2. Tie-breaker: Daha erken kayıt yapana
        return new Date(a.kayitTarihi) - new Date(b.kayitTarihi);
      });
    
    uygunOgrenciler.forEach(ogrenci => {
      if (gunlukSayisi >= gunlukMaxOgrenci) {
        rapor.basarisiz.push({
          ad: ogrenci.ad,
          tel: ogrenci.tel,
          gun,
          neden: `Günlük limit aşıldı (maks ${gunlukMaxOgrenci} öğrenci/gün)`
        });
        return;
      }
      
      // Uygun boş slot bul
      const uygunBosSlot = ogrenci.saatler.find(saat => 
        gunlukSlotKullanimi[gun][saat] === null
      );
      
      if (uygunBosSlot) {
        gunlukSlotKullanimi[gun][uygunBosSlot] = ogrenci.ogrenciId;
        gunlukSayisi++;
        atananlar.add(ogrenci.ogrenciId);
        
        // Planlandı olarak işaretle
        ogrenci.planlandi = true;
        ogrenci.planlandigiSaat = uygunBosSlot;
        
        rapor.basarili.push({
          ad: ogrenci.ad,
          tel: ogrenci.tel,
          gun,
          saat: uygunBosSlot
        });
      } else {
        // Detaylı neden bul
        let detayliNeden = '';
        
        if (ogrenci.saatler.length === 1) {
          const tekSaat = ogrenci.saatler[0];
          const kullanan = gunlukSlotKullanimi[gun][tekSaat];
          if (kullanan) {
            const digerOgrenci = uygunluklar.find(u => u.ogrenciId === kullanan);
            detayliNeden = `Seçtiği tek saat (${tekSaat}) ${digerOgrenci ? digerOgrenci.ad : 'başka öğrenci'} tarafından alındı`;
          } else {
            detayliNeden = `Seçtiği saat (${tekSaat}) uygun değil`;
          }
        } else {
          const alinanSaatler = ogrenci.saatler.filter(s => gunlukSlotKullanimi[gun][s] !== null);
          detayliNeden = `Tüm seçtiği saatler dolu (${ogrenci.saatler.length} saatten ${alinanSaatler.length}'i alındı)`;
        }
        
        rapor.basarisiz.push({
          ad: ogrenci.ad,
          tel: ogrenci.tel,
          gun,
          neden: detayliNeden,
          secilenSaatler: ogrenci.saatler.join(', ')
        });
      }
    });
  });
  
  rapor.toplam = rapor.basarili.length + rapor.basarisiz.length;
  
  try {
    await veriKaydet();
    planlamaRaporuGoster(rapor);
    hocaPaneliYukle();
  } catch (error) {
    alert('❌ Planlama kaydetme hatası: ' + error.message);
  }
}

function planlamaRaporuGoster(rapor) {
  // Haftalık takvimi hemen güncelle
  haftalikTakvimOlustur();
  
  // Planlanamayan öğrencileri göster
  const planlanmayanBolum = document.getElementById('planlanmayanBolum');
  const planlanmayanListe = document.getElementById('planlanmayanListe');
  const planlanmayanSayisi = document.getElementById('planlanmayanSayisi');
  
  if (rapor.basarisiz.length > 0) {
    planlanmayanBolum.style.display = 'block';
    planlanmayanSayisi.textContent = rapor.basarisiz.length;
    
    let html = '';
    rapor.basarisiz.forEach((r, index) => {
      // Öğrencinin ID'sini bul
      const ogrenci = uygunluklar.find(u => u.ad === r.ad && u.tel === r.tel && u.gun === r.gun);
      const ogrenciId = ogrenci ? ogrenci.ogrenciId : null;
      
      html += `
        <div class="planlanan-item">
          <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:0.5rem;">
            <strong style="font-size:1rem;">${r.ad}</strong>
            <span style="font-size:0.85rem; color:var(--text-secondary);">📱 ${r.tel}</span>
          </div>
          <div style="background:rgba(251,191,36,0.15); padding:0.5rem; border-radius:4px; margin-bottom:0.5rem;">
            <div style="font-size:0.9rem; color:var(--text-primary); margin-bottom:0.25rem;">
              📅 <strong>${r.gun}</strong>
            </div>
            <div style="font-size:0.85rem; color:#dc3545;">
              ⚠️ ${r.neden}
            </div>
            ${r.secilenSaatler ? `<div style="font-size:0.8rem; color:var(--text-secondary); margin-top:0.25rem;">
              Seçtiği saatler: ${r.secilenSaatler}
            </div>` : ''}
          </div>
          ${ogrenciId ? `
          <button onclick="planlanmayanDuzenle('${ogrenciId}', '${r.ad}', '${r.tel}', '${r.gun}')" class="btn btn-warning" style="width:100%; padding:0.6rem; margin-top:0.5rem;">
            ✏️ Düzenle & Programa Ekle
          </button>
          ` : ''}
        </div>
      `;
    });
    
    planlanmayanListe.innerHTML = html;
    planlanmayanListe.style.display = 'block'; // Otomatik aç
    document.getElementById('planlanmayanToggleText').textContent = 'Gizle';
  } else {
    planlanmayanBolum.style.display = 'none';
  }
  
  // Küçük bildirim göster
  const mesaj = `✅ Planlama tamamlandı!\n\n📊 Toplam: ${rapor.toplam}\n✅ Planlanan: ${rapor.basarili.length}\n❌ Planlanamayan: ${rapor.basarisiz.length}`;
  
  alert(mesaj);
}

function whatsappMesajGonder(tel, ad, gun, saat) {
  document.getElementById('whatsappOgrenciAdi').textContent = ad;
  document.getElementById('whatsappGun').textContent = gun;
  document.getElementById('whatsappSaat').textContent = saat;
  document.getElementById('whatsappTelefon').value = tel;
  
  const varsayilanMesaj = `Merhaba ${ad},

Direksiyon dersiniz:
📅 ${gun}
⏰ ${saat}

Saygılarımla,
Sürücü Kursu`;
  
  document.getElementById('whatsappMesaj').value = varsayilanMesaj;
  document.getElementById('whatsappModal').style.display = 'flex';
}

function whatsappModalKapat() {
  document.getElementById('whatsappModal').style.display = 'none';
}

function whatsappGonder() {
  const tel = document.getElementById('whatsappTelefon').value;
  const mesaj = document.getElementById('whatsappMesaj').value;
  
  if (!tel || !mesaj) {
    alert('❌ Telefon veya mesaj boş olamaz!');
    return;
  }
  
  // Sadece rakamları al
  let temizTel = tel.replace(/\D/g, '');
  
  console.log('Orijinal Tel:', tel);
  console.log('Temizlenmiş Tel:', temizTel);
  
  // Türkiye formatına çevir
  if (temizTel.startsWith('0')) {
    // 05321234567 (11 hane) → 5321234567 (10 hane)
    temizTel = temizTel.substring(1);
  } else if (temizTel.startsWith('90')) {
    // 905321234567 (12 hane) → 5321234567 (10 hane)
    temizTel = temizTel.substring(2);
  } else if (temizTel.startsWith('5')) {
    // 5321234567 (10 hane) → doğru
    temizTel = temizTel;
  } else {
    alert('❌ Geçersiz telefon numarası!\nDoğru format: 05XX XXX XXXX');
    return;
  }
  
  // 10 haneli olmalı
  if (temizTel.length !== 10) {
    alert(`❌ Telefon numarası 10 haneli olmalı!\nŞu anda: ${temizTel.length} hane\nNumara: ${temizTel}`);
    return;
  }
  
  // Başına 90 ekle
  const uluslararasiTel = '90' + temizTel;
  
  console.log('Son Tel:', uluslararasiTel);
  
  // WhatsApp Web URL'si
  const whatsappUrl = `https://wa.me/${uluslararasiTel}?text=${encodeURIComponent(mesaj)}`;
  
  console.log('WhatsApp URL:', whatsappUrl);
  
  // Yeni sekmede aç
  window.open(whatsappUrl, '_blank');
  
  whatsappModalKapat();
}

function mesajSablonSec(sablon) {
  const ad = document.getElementById('whatsappOgrenciAdi').textContent;
  const gun = document.getElementById('whatsappGun').textContent;
  const saat = document.getElementById('whatsappSaat').textContent;
  
  let mesaj = '';
  
  switch(sablon) {
    case 'hatirlatma':
      mesaj = `Merhaba ${ad},

📢 DERS HATIRLATMASI

Yarınki dersinizi hatırlatmak istedim:
📅 ${gun}
⏰ ${saat}

Görüşmek üzere! 🚗`;
      break;
      
    case 'onay':
      mesaj = `Merhaba ${ad},

✅ DERSİNİZ ONAYLANDI

📅 Gün: ${gun}
⏰ Saat: ${saat}
📍 Adres: [Kurs adresi]

Saygılarımla,
Sürücü Kursu`;
      break;
      
    case 'iptal':
      mesaj = `Merhaba ${ad},

⚠️ DERS İPTALİ

Maalesef ${gun} günü ${saat} dersimizi iptal etmek zorundayız.

Yeni tarih için lütfen bize dönüş yapın.

Özür dileriz.`;
      break;
      
    case 'degisiklik':
      mesaj = `Merhaba ${ad},

🔄 DERS SAATİ DEĞİŞTİ

Yeni ders saatiniz:
📅 ${gun}
⏰ ${saat}

Onaylıyor musunuz?`;
      break;
      
    default:
      mesaj = `Merhaba ${ad},

Direksiyon dersiniz:
📅 ${gun}
⏰ ${saat}

Saygılarımla,
Sürücü Kursu`;
  }
  
  document.getElementById('whatsappMesaj').value = mesaj;
}

function detaylariGoster() {
  document.getElementById('detaylarModal').style.display = 'flex';
  hocaIstatistikGoster();
  hocaTablosuGoster();
}

function detaylariKapat() {
  document.getElementById('detaylarModal').style.display = 'none';
}

function ayarlariGoster() {
  document.getElementById('ayarlarModal').style.display = 'flex';
}

function ayarlariKapat() {
  document.getElementById('ayarlarModal').style.display = 'none';
}

function planlanmayanToggle() {
  const liste = document.getElementById('planlanmayanListe');
  const toggleText = document.getElementById('planlanmayanToggleText');
  
  if (liste.style.display === 'none') {
    liste.style.display = 'block';
    toggleText.textContent = 'Gizle';
  } else {
    liste.style.display = 'none';
    toggleText.textContent = 'Göster';
  }
}

// Planlanamayan öğrenci düzenleme
let mevcutPlanlanmayanOgrenci = null;

function planlanmayanDuzenle(ogrenciId, ad, tel, mevcutGun) {
  // Öğrenciyi bul
  const ogrenci = uygunluklar.find(u => u.ogrenciId === ogrenciId && u.gun === mevcutGun);
  
  if (!ogrenci) {
    alert('❌ Öğrenci bulunamadı!');
    return;
  }
  
  mevcutPlanlanmayanOgrenci = {
    ogrenciId: ogrenciId,
    ad: ad,
    tel: tel,
    eskiGun: mevcutGun
  };
  
  // Modal'ı doldur
  document.getElementById('planlanmayanDuzenleAd').textContent = ad;
  document.getElementById('planlanmayanDuzenleTel').textContent = `📱 ${tel}`;
  document.getElementById('planlanmayanDuzenleGun').value = mevcutGun;
  document.getElementById('planlanmayanDuzenleSaat').value = CONFIG.SLOTLAR[0]; // İlk saati seç
  
  // Modal'ı aç
  document.getElementById('planlanmayanDuzenleModal').style.display = 'flex';
}

function planlanmayanDuzenleKapat() {
  document.getElementById('planlanmayanDuzenleModal').style.display = 'none';
  mevcutPlanlanmayanOgrenci = null;
}

async function planlanmayanKaydet() {
  if (!mevcutPlanlanmayanOgrenci) {
    alert('❌ Hata: Öğrenci bilgisi bulunamadı!');
    return;
  }
  
  const yeniGun = document.getElementById('planlanmayanDuzenleGun').value;
  const yeniSaat = document.getElementById('planlanmayanDuzenleSaat').value;
  
  // Seçilen slot'un dolu olup olmadığını kontrol et
  const slotDoluMu = uygunluklar.some(u => 
    u.gun === yeniGun && 
    u.planlandi === true && 
    u.planlandigiSaat === yeniSaat
  );
  
  if (slotDoluMu) {
    if (!confirm(`⚠️ ${yeniGun} günü ${yeniSaat} saati başka bir öğrenci tarafından kullanılıyor!\n\nYine de eklemek ister misiniz?`)) {
      return;
    }
  }
  
  // Eski kaydı bul ve güncelle
  const eskiKayit = uygunluklar.find(u => 
    u.ogrenciId === mevcutPlanlanmayanOgrenci.ogrenciId && 
    u.gun === mevcutPlanlanmayanOgrenci.eskiGun
  );
  
  if (eskiKayit) {
    // Günü güncelle
    eskiKayit.gun = yeniGun;
    eskiKayit.planlandi = true;
    eskiKayit.planlandigiSaat = yeniSaat;
    eskiKayit.saatler = [yeniSaat]; // Yeni saati ekle
    
    try {
      await veriKaydet();
      alert(`✅ Başarılı!\n\n${mevcutPlanlanmayanOgrenci.ad} isimli öğrenci ${yeniGun} günü ${yeniSaat} saatine eklendi.`);
      
      planlanmayanDuzenleKapat();
      hocaPaneliYukle();
    } catch (error) {
      alert('❌ Kayıt sırasında hata: ' + error.message);
    }
  } else {
    alert('❌ Öğrenci kaydı bulunamadı!');
  }
}

// Modal dışına tıklayınca kapat
document.addEventListener('click', function(e) {
  if (e.target.classList.contains('modal')) {
    e.target.style.display = 'none';
  }
});

function planlamaTemizle() {
  if (!confirm('🔄 Tüm planlamayı sıfırlamak istediğinize emin misiniz?')) return;
  
  uygunluklar.forEach(u => {
    delete u.planlandi;
    delete u.planlandigiSaat;
  });
  
  veriKaydet();
  alert('✅ Planlama sıfırlandı!');
  hocaPaneliYukle();
}


function pdfIndir() {
  if (uygunluklar.length === 0) return alert('⚠️ Kayıt yok!');
  
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  
  doc.setFontSize(16);
  doc.text("Ders Programı", 105, 15, { align: 'center' });
  
  doc.autoTable({
    startY: 30,
    head: [["Öğrenci", "Telefon", "Gün", "Saatler", "Durum"]],
    body: uygunluklar.map(k => [
      k.ad, 
      k.tel, 
      k.gun, 
      k.tip === 'tumGun' ? 'Tüm Gün' : k.saatler.join(', '),
      k.planlandi ? 'Planlandı' : 'Bekliyor'
    ])
  });
  
  doc.save(`ders_programi_${new Date().toLocaleDateString('tr-TR')}.pdf`);
}

function excelIndir() {
  if (uygunluklar.length === 0) return alert('⚠️ Kayıt yok!');
  
  const ws_data = [
    ["Öğrenci", "Telefon", "Gün", "Saatler", "Durum"],
    ...uygunluklar.map(k => [
      k.ad,
      k.tel,
      k.gun,
      k.tip === 'tumGun' ? 'Tüm Gün' : k.saatler.join(', '),
      k.planlandi ? 'Planlandı' : 'Bekliyor'
    ])
  ];
  
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(ws_data);
  ws['!cols'] = [{ wch: 20 }, { wch: 15 }, { wch: 12 }, { wch: 30 }, { wch: 12 }];
  
  XLSX.utils.book_append_sheet(wb, ws, "Program");
  XLSX.writeFile(wb, `ders_programi_${new Date().toLocaleDateString('tr-TR')}.xlsx`);
}


function kayitAra() {
  const val = document.getElementById('searchInput').value.toLowerCase();
  document.querySelectorAll('#tabloVeri tr').forEach(r => {
    const text = r.textContent.toLowerCase();
    r.style.display = text.includes(val) ? '' : 'none';
  });
}


document.addEventListener('DOMContentLoaded', async function() {
  temaYukle();
  
  // Firebase'den veri yükle ve dinlemeye başla
  try {
    await veriYukle();
    veriDinle(); // Realtime updates için
  } catch (error) {
    alert('⚠️ Veri yükleme hatası: ' + error.message);
  }
  
  // Tema butonu
  document.getElementById('themeToggle')?.addEventListener('click', temaToggle);
  
  // Panel değiştirme
  document.getElementById('ogrenciBtn')?.addEventListener('click', () => {
    document.getElementById('ogrenciPanel').style.display = 'block';
    document.getElementById('hocaPanel').style.display = 'none';
    document.getElementById('ogrenciBtn').classList.add('active');
    document.getElementById('hocaBtn').classList.remove('active');
  });
  
  document.getElementById('hocaBtn')?.addEventListener('click', () => {
    document.getElementById('ogrenciPanel').style.display = 'none';
    document.getElementById('hocaPanel').style.display = 'block';
    document.getElementById('ogrenciBtn').classList.remove('active');
    document.getElementById('hocaBtn').classList.add('active');
  });
  
  // Öğrenci giriş
  document.getElementById('ogrenciLoginForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const ad = document.getElementById('loginAdSoyad').value.trim();
    const tel = document.getElementById('loginTelefon').value.trim();
    const beniHatirla = document.getElementById('beniHatirla').checked;
    ogrenciGiris(ad, tel, beniHatirla);
  });
  
  document.getElementById('farkliHesapBtn')?.addEventListener('click', function() {
    if (confirm('💭 Kayıtlı bilgileri silmek istediğinize emin misiniz?')) {
      localStorage.removeItem('kayitliOgrenci');
      document.getElementById('loginAdSoyad').value = '';
      document.getElementById('loginTelefon').value = '';
      document.getElementById('beniHatirla').checked = false;
      this.style.display = 'none';
      alert('✅ Silindi!');
    }
  });
  
  // Uygunluk kaydet
  document.getElementById('formUygunluk')?.addEventListener('submit', uygunlukKaydet);
  
  // Radio değişimi
  document.querySelectorAll('input[name="uygunlukTipi"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      const saatSecimDiv = document.getElementById('saatSecimDiv');
      const tumGunLabel = document.getElementById('tumGunLabel');
      const saatBazliLabel = document.getElementById('saatBazliLabel');
      
      document.querySelectorAll('.radio-option').forEach(opt => {
        opt.style.borderColor = 'var(--border)';
        opt.style.background = 'transparent';
      });
      
      if (e.target.value === 'saatBazli') {
        saatSecimDiv.style.display = 'block';
        saatBazliLabel.style.borderColor = 'var(--primary)';
        saatBazliLabel.style.background = 'rgba(30, 58, 95, 0.05)';
      } else {
        saatSecimDiv.style.display = 'none';
        tumGunLabel.style.borderColor = 'var(--primary)';
        tumGunLabel.style.background = 'rgba(30, 58, 95, 0.05)';
        document.querySelectorAll('input[name="saatler"]').forEach(cb => cb.checked = false);
        document.querySelectorAll('.time-checkbox').forEach(tc => {
          tc.style.borderColor = 'var(--border)';
          tc.style.background = 'var(--bg-card)';
        });
      }
    });
  });
  
  // Checkbox stilleri
  document.querySelectorAll('.time-checkbox input[type="checkbox"]').forEach(checkbox => {
    checkbox.addEventListener('change', (e) => {
      const label = e.target.closest('.time-checkbox');
      if (e.target.checked) {
        label.style.borderColor = 'var(--primary)';
        label.style.background = 'rgba(30, 58, 95, 0.1)';
      } else {
        label.style.borderColor = 'var(--border)';
        label.style.background = 'var(--bg-card)';
      }
    });
  });
  
  // Hoca giriş
  document.getElementById('hocaLoginForm')?.addEventListener('submit', hocaGiris);
  
  // Hoca arama
  document.getElementById('searchInput')?.addEventListener('input', kayitAra);
  
  // Beni hatırla kontrolü
  const kayitliOgrenci = localStorage.getItem('kayitliOgrenci');
  if (kayitliOgrenci) {
    const { ad, tel } = JSON.parse(kayitliOgrenci);
    document.getElementById('loginAdSoyad').value = ad;
    document.getElementById('loginTelefon').value = tel;
    document.getElementById('beniHatirla').checked = true;
    document.getElementById('farkliHesapBtn').style.display = 'block';
  }
  
  // Hoca otomatik giriş
  if (localStorage.getItem('hocaGirisYapti') === 'true') {
    document.getElementById('ogrenciPanel').style.display = 'none';
    document.getElementById('hocaPanel').style.display = 'block';
    document.getElementById('ogrenciBtn').classList.remove('active');
    document.getElementById('hocaBtn').classList.add('active');
    document.getElementById('hocaLoginDiv').style.display = 'none';
    document.getElementById('hocaTabloDiv').style.display = 'block';
    hocaPaneliYukle();
  } else {
    document.getElementById('ogrenciPanel').style.display = 'block';
    document.getElementById('hocaPanel').style.display = 'none';
    document.getElementById('ogrenciBtn').classList.add('active');
  }
});

// Global fonksiyonlar
window.uygunlukSil = uygunlukSil;
window.hocaSil = hocaSil;
window.hocaCikis = hocaCikis;
window.ogrenciCikis = ogrenciCikis;
window.otomatikPlanOlustur = otomatikPlanOlustur;
window.planlamaTemizle = planlamaTemizle;
window.tumKayitlariSil = tumKayitlariSil;
window.hucreYonetimi = hucreYonetimi;
window.yeniDersEkle = yeniDersEkle;
window.dersDuzenle = dersDuzenle;
window.dersSil = dersSil;
window.detaylariGoster = detaylariGoster;
window.detaylariKapat = detaylariKapat;
window.ayarlariGoster = ayarlariGoster;
window.ayarlariKapat = ayarlariKapat;
window.planlanmayanToggle = planlanmayanToggle;
window.pdfIndir = pdfIndir;
window.excelIndir = excelIndir;
window.dersDuzenleKapat = dersDuzenleKapat;
window.dersiKaydet = dersiKaydet;
window.dersiSil = dersiSil;
window.whatsappMesajGonder = whatsappMesajGonder;
window.whatsappModalKapat = whatsappModalKapat;
window.whatsappGonder = whatsappGonder;
window.mesajSablonSec = mesajSablonSec;
window.planlanmayanDuzenle = planlanmayanDuzenle;
window.planlanmayanDuzenleKapat = planlanmayanDuzenleKapat;
window.planlanmayanKaydet = planlanmayanKaydet;
