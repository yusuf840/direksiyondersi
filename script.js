// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyAXuHRWx4rGY774-HXVq94guUHqC5glNsc",
  authDomain: "direksiyon-dersi-29912.firebaseapp.com",
  databaseURL: "https://direksiyon-dersi-29912-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "direksiyon-dersi-29912",
  storageBucket: "direksiyon-dersi-29912.firebasestorage.app",
  messagingSenderId: "317753012196",
  appId: "1:317753012196:web:0d5fd666a32d2fcd5021f1"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

document.addEventListener("DOMContentLoaded", function () {
  const slotler = ["08:00","09:00","10:00","11:00","13:00","14:00","15:00","16:00","17:00"];
  const tumGunler = ["Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi"];

  // DOM Elementleri
  const ogrenciBtn = document.getElementById("ogrenciBtn");
  const hocaBtn = document.getElementById("hocaBtn");
  const ogrenciPanel = document.getElementById("ogrenciPanel");
  const hocaPanel = document.getElementById("hocaPanel");
  const hocaTabloDiv = document.getElementById("hocaTabloDiv");
  const hocaLoginForm = document.getElementById("hocaLoginForm");
  const ogrenciLoginForm = document.getElementById("ogrenciLoginForm");
  const ogrenciFormDiv = document.getElementById("ogrenciFormDiv");
  const ogrenciLoginDiv = document.getElementById("ogrenciLoginDiv");

  let girisYapanOgrenci = null;
  let kayitlar = [];

  // ==================== TEMA SİSTEMİ ====================
  const themeToggle = document.getElementById("themeToggle");
  const moonIcon = document.querySelector(".moon-icon");
  const sunIcon = document.querySelector(".sun-icon");
  
  // Sayfa yüklendiğinde tema kontrolü
  const savedTheme = localStorage.getItem("theme") || "light";
  document.documentElement.setAttribute("data-theme", savedTheme);
  updateThemeIcon(savedTheme);
  
  function updateThemeIcon(theme) {
    if (theme === "dark") {
      moonIcon.classList.remove("active");
      sunIcon.classList.add("active");
    } else {
      sunIcon.classList.remove("active");
      moonIcon.classList.add("active");
    }
  }
  
  themeToggle?.addEventListener("click", () => {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    const newTheme = currentTheme === "dark" ? "light" : "dark";
    
    document.documentElement.setAttribute("data-theme", newTheme);
    localStorage.setItem("theme", newTheme);
    updateThemeIcon(newTheme);
  });
  // ==================== TEMA SİSTEMİ BİTİŞ ====================

  // Mobil İyileştirmeleri
  
  // Pull-to-refresh devre dışı (yanlışlıkla yenileme önleme)
  let lastTouchY = 0;
  let preventPullToRefresh = false;
  
  document.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;
    lastTouchY = e.touches[0].clientY;
    preventPullToRefresh = window.pageYOffset === 0;
  }, { passive: false });
  
  document.addEventListener('touchmove', e => {
    const touchY = e.touches[0].clientY;
    const touchYDelta = touchY - lastTouchY;
    lastTouchY = touchY;
    if (preventPullToRefresh) {
      preventPullToRefresh = false;
      if (touchYDelta > 0) {
        e.preventDefault();
        return;
      }
    }
  }, { passive: false });

  // iOS Safari - Input focus sonrası zoom önleme
  document.querySelectorAll('input, select, textarea').forEach(el => {
    el.addEventListener('blur', () => {
      window.scrollTo(0, 0);
    });
  });

  // Telefon numarası input için numeric keyboard
  const telefonInputs = document.querySelectorAll('input[type="tel"]');
  telefonInputs.forEach(input => {
    input.setAttribute('inputmode', 'numeric');
    input.setAttribute('pattern', '[0-9]*');
  });

  // Firebase İşlemleri
  function loadData() {
    database.ref('ogrenciKayitlar').on('value', (snapshot) => {
      kayitlar = snapshot.val() || [];
      guncelleTumTablolar();
    });
  }

  function saveData(data) {
    return database.ref('ogrenciKayitlar').set(data)
      .catch(err => {
        console.error("Firebase Hatası:", err);
        alert("❌ Kayıt başarısız! Hata: " + err.message);
      });
  }

  // Telefon Doğrulama
  function telefonDogrula(tel) {
    return /^05[0-9]{9}$/.test(tel);
  }

  // Panel Geçişleri
  ogrenciBtn?.addEventListener("click", () => switchPanel("ogrenci"));
  hocaBtn?.addEventListener("click", () => switchPanel("hoca"));
  
  function switchPanel(panel) {
    const isOgrenci = panel === "ogrenci";
    if(ogrenciPanel) ogrenciPanel.style.display = isOgrenci ? "block" : "none";
    if(hocaPanel) hocaPanel.style.display = isOgrenci ? "none" : "block";
    ogrenciBtn?.classList.toggle("active", isOgrenci);
    hocaBtn?.classList.toggle("active", !isOgrenci);
  }

  // Sayfa Yüklendiğinde Hoca Oturumu Kontrolü
  if(localStorage.getItem("hocaGirisYapti") === "true") {
    switchPanel("hoca");
    if(hocaLoginForm) hocaLoginForm.style.display = "none";
    if(hocaTabloDiv) {
      hocaTabloDiv.style.display = "block";
      setTimeout(hocaTablosuGoster, 100);
    }
    const hocaCikisDiv = document.getElementById("hocaCikisDiv");
    if(hocaCikisDiv) hocaCikisDiv.style.display = "block";
  } else {
    switchPanel("ogrenci");
  }

  // Boş Saatleri Hesapla
  function hesaplaBosSaatler() {
    return tumGunler.reduce((acc, gun) => {
      acc[gun] = slotler.filter(saat => !kayitlar.some(k => k.gun === gun && k.saat === saat));
      return acc;
    }, {});
  }

  // Boş Saatleri Liste Olarak Göster
  function gosterBosSaatlerListe(listeElementi) {
    const bosSaatler = hesaplaBosSaatler();
    listeElementi.innerHTML = "";
    Object.entries(bosSaatler).forEach(([gun, saatler]) => {
      if(saatler.length > 0) {
        const li = document.createElement("li");
        li.textContent = `${gun}: ${saatler.join(", ")}`;
        listeElementi.appendChild(li);
      }
    });
  }

  // Boş Saatleri Görsel Tablo Olarak Göster
  function gosterBosSaatlerTablo(tabloElementId) {
    const bosSaatTablo = document.getElementById(tabloElementId);
    if(!bosSaatTablo) return;
    
    bosSaatTablo.innerHTML = `
      <table>
        <thead>
          <tr><th>Gün</th>${slotler.map(s => `<th>${s}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${tumGunler.map(gun => `
            <tr>
              <td>${gun}</td>
              ${slotler.map(saat => {
                const dolu = kayitlar.some(k => k.gun === gun && k.saat === saat);
                return `<td style="background-color:${dolu ? "#ff4d4d" : "#4CAF50"}; color:white;">${dolu ? "Dolu" : "Boş"}</td>`;
              }).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  // Öğrenci Giriş - Önceki Bilgileri Yükle
  const kayitliOgrenci = localStorage.getItem("kayitliOgrenci");
  if(kayitliOgrenci) {
    const ogrenci = JSON.parse(kayitliOgrenci);
    document.getElementById("loginAdSoyad").value = ogrenci.ad;
    document.getElementById("loginTelefon").value = ogrenci.tel;
    const beniHatirlaCheckbox = document.getElementById("beniHatirla");
    if(beniHatirlaCheckbox) beniHatirlaCheckbox.checked = true;
  }

  // Farklı Hesap Butonu
  document.getElementById("farkliHesapBtn")?.addEventListener("click", function(){
    if(confirm("💭 Kayıtlı bilgileri silmek istediğinize emin misiniz?")) {
      localStorage.removeItem("kayitliOgrenci");
      document.getElementById("loginAdSoyad").value = "";
      document.getElementById("loginTelefon").value = "";
      const beniHatirlaCheckbox = document.getElementById("beniHatirla");
      if(beniHatirlaCheckbox) beniHatirlaCheckbox.checked = false;
      alert("✅ Kayıtlı bilgiler silindi!");
    }
  });

  // Öğrenci Giriş
  ogrenciLoginForm?.addEventListener("submit", function(e){
    e.preventDefault();
    const ad = document.getElementById("loginAdSoyad").value.trim();
    const tel = document.getElementById("loginTelefon").value.trim();
    const beniHatirla = document.getElementById("beniHatirla")?.checked;
    
    if(!ad || !tel) return alert("❌ Lütfen tüm alanları doldurun!");
    
    // Ad kontrolü (minimum 3 karakter)
    if(ad.length < 3) return alert("❌ Ad en az 3 karakter olmalıdır!");
    
    // Ad sadece harf ve boşluk içermeli
    if(!/^[a-zA-ZğüşıöçĞÜŞİÖÇ\s]+$/.test(ad)) {
      return alert("❌ Ad sadece harf içermelidir!");
    }
    
    if(!telefonDogrula(tel)) return alert("❌ Geçersiz telefon! Format: 05XXXXXXXXX");

    // Beni Hatırla işaretliyse kaydet
    if(beniHatirla) {
      localStorage.setItem("kayitliOgrenci", JSON.stringify({ad, tel}));
    } else {
      localStorage.removeItem("kayitliOgrenci");
    }

    girisYapanOgrenci = {ad, tel};
    ogrenciLoginDiv.style.display = "none";
    ogrenciFormDiv.style.display = "block";
    document.getElementById("ogrenciAdi").value = ad;
    document.getElementById("telefon").value = tel;
    gosterOgrenciTablo();
  });

  // Öğrenci Randevu Kaydetme
  document.getElementById("formUygunluk")?.addEventListener("submit", function(e){
    e.preventDefault();
    const gun = document.getElementById("gun").value;
    const saat = document.getElementById("saat").value;
    const duzenleIndex = parseInt(document.getElementById("duzenleIndex")?.value || -1);

    // Çakışma kontrolü
    const dolu = kayitlar.find((k,i) => k.gun===gun && k.saat===saat && i!==duzenleIndex);
    if(dolu){
      const bosSaat = slotler.find(s => !kayitlar.some((k,i) => k.gun===gun && k.saat===s && i!==duzenleIndex));
      return alert(bosSaat ? `❌ Seçtiğiniz saat dolu!\nEn yakın boş saat: ${bosSaat}` : "❌ Bu gün için boş slot yok.");
    }

    const yeniKayit = {
      ad: girisYapanOgrenci.ad, 
      tel: girisYapanOgrenci.tel,
      gun, 
      saat
    };

    if(duzenleIndex >= 0) kayitlar[duzenleIndex] = yeniKayit;
    else kayitlar.push(yeniKayit);
    
    saveData(kayitlar).then(() => {
      document.getElementById("gun").selectedIndex = 0;
      document.getElementById("saat").selectedIndex = 0;
      document.getElementById("duzenleIndex").value = "-1";
      alert("✅ Randevu kaydedildi!");
    });
  });

  // Öğrenci Tablosu
  function gosterOgrenciTablo(){
    const tbody = document.getElementById("ogrenciTabloVeri");
    if(!tbody) return;
    
    const kendiKayitlari = kayitlar.filter(k => 
      k.ad === girisYapanOgrenci?.ad && k.tel === girisYapanOgrenci?.tel
    );

    tbody.innerHTML = kendiKayitlari.map((k, index) => {
      const globalIndex = kayitlar.indexOf(k);
      return `
        <tr>
          <td>${k.ad}</td><td>${k.tel}</td><td>${k.gun}</td><td>${k.saat}</td>
          <td>
            <button onclick="duzenle(${globalIndex})">Düzenle</button>
            <button onclick="sil(${globalIndex})">Sil</button>
          </td>
        </tr>
      `;
    }).join("");
  }

  window.duzenle = function(globalIndex){
    const k = kayitlar[globalIndex];
    document.getElementById("gun").value = k.gun;
    document.getElementById("saat").value = k.saat;
    document.getElementById("duzenleIndex").value = globalIndex;
  };

  window.sil = function(globalIndex){
    if(!confirm("Bu randevuyu silmek istediğinize emin misiniz?")) return;
    kayitlar.splice(globalIndex, 1);
    saveData(kayitlar).then(() => alert("✅ Randevu silindi!"));
  };

  // Öğrenci Boş Saat Butonu
  document.getElementById("bosSaatBtn")?.addEventListener("click", () => {
    const tablo = document.getElementById("ogrenciBosSaatTablo");
    if(!tablo) return;
    
    if(tablo.style.display === "none" || tablo.style.display === "") {
      gosterBosSaatlerTablo("ogrenciBosSaatTablo");
      tablo.style.display = "block";
    } else {
      tablo.style.display = "none";
    }
  });

  // Hoca Giriş
  hocaLoginForm?.addEventListener("submit", e => {
    e.preventDefault();
    if(document.getElementById("sifre").value === "12345"){
      localStorage.setItem("hocaGirisYapti", "true");
      hocaTabloDiv.style.display = "block";
      hocaLoginForm.style.display = "none";
      
      const hocaCikisDiv = document.getElementById("hocaCikisDiv");
      if(hocaCikisDiv) hocaCikisDiv.style.display = "block";
      
      hocaTablosuGoster();
    } else alert("❌ Şifre yanlış!");
  });

  // Hoca Tablosu
  function hocaTablosuGoster(){
    const tbody = document.getElementById("tabloVeri");
    if(!tbody) return;
    
    tbody.innerHTML = kayitlar.map((k, index) => `
      <tr>
        <td>${k.gun}</td><td>${k.saat}</td><td>${k.ad}</td><td>${k.tel}</td>
        <td>
          <button onclick="hocaDuzenle(${index})">Düzenle</button>
          <button onclick="hocaSil(${index})">Sil</button>
        </td>
      </tr>
    `).join("");

    // İstatistikler
    const ogrenciler = new Set(kayitlar.map(k => `${k.ad}|${k.tel}`));
    const gunSayilari = kayitlar.reduce((acc, k) => {
      acc[k.gun] = (acc[k.gun] || 0) + 1;
      return acc;
    }, {});
    const enYogunGun = Object.keys(gunSayilari).length ? 
      Object.keys(gunSayilari).reduce((a, b) => gunSayilari[a] > gunSayilari[b] ? a : b) : "-";
    const bosSaatToplam = Object.values(hesaplaBosSaatler()).reduce((sum, arr) => sum + arr.length, 0);

    document.getElementById("toplamOgrenci").innerText = `📆 Toplam Öğrenci: ${ogrenciler.size}`;
    document.getElementById("enYogunGun").innerText = `🧩 En Yoğun Gün: ${enYogunGun}`;
    document.getElementById("bosSaatler").innerText = `⏰ Boş Saatler: ${bosSaatToplam}`;

    const hocaBosSaatListe = document.getElementById("hocaBosSaatListe");
    if(hocaBosSaatListe) gosterBosSaatlerListe(hocaBosSaatListe);
    gosterBosSaatlerTablo("hocaBosSaatTablo");
  }

  // Hoca Düzenleme Formu
  document.getElementById("hocaDuzenleForm")?.addEventListener("submit", function(e){
    e.preventDefault();
    const index = parseInt(document.getElementById("hocaDuzenleIndex").value);
    const yeniGun = document.getElementById("hocaDuzenleGun").value;
    const yeniSaat = document.getElementById("hocaDuzenleSaat").value;
    
    const cakisan = kayitlar.find((k, i) => i !== index && k.gun === yeniGun && k.saat === yeniSaat);
    if(cakisan) {
      return alert(`❌ ${yeniGun} ${yeniSaat} saatinde başka öğrenci var!\n\n${cakisan.ad} - ${cakisan.tel}`);
    }
    
    kayitlar[index].gun = yeniGun;
    kayitlar[index].saat = yeniSaat;
    
    saveData(kayitlar).then(() => {
      document.getElementById("hocaDuzenleFormDiv").style.display = "none";
      document.getElementById("hocaDuzenleIndex").value = "-1";
      alert("✅ Randevu güncellendi!");
    });
  });

  // Hoca Boş Saat Butonu
  document.getElementById("hocaBosSaatBtn")?.addEventListener("click", () => {
    const tablo = document.getElementById("hocaBosSaatTablo");
    if(!tablo) return;
    
    if(tablo.style.display === "none" || tablo.style.display === "") {
      gosterBosSaatlerTablo("hocaBosSaatTablo");
      tablo.style.display = "block";
    } else {
      tablo.style.display = "none";
    }
  });

  // Arama
  document.getElementById("searchInput")?.addEventListener("input", function(){
    const val = this.value.toLowerCase();
    document.querySelectorAll("#tabloVeri tr").forEach(r => {
      r.style.display = r.innerText.toLowerCase().includes(val) ? "" : "none";
    });
  });

  // PDF İndirme
  document.getElementById("pdfBtn")?.addEventListener("click", function(){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.autoTable({ 
      head: [["Gün","Saat","Öğrenci","Telefon"]], 
      body: kayitlar.map(k => [k.gun, k.saat, k.ad, k.tel]) 
    });
    doc.save("ders_programi.pdf");
  });

  // Excel İndirme
  document.getElementById("excelBtn")?.addEventListener("click", function(){
    const ws_data = [["Gün","Saat","Öğrenci","Telefon"], ...kayitlar.map(k => [k.gun, k.saat, k.ad, k.tel])];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ws_data), "DersProgrami");
    XLSX.writeFile(wb, "ders_programi.xlsx");
  });

  // Tüm Tabloları Güncelle
  function guncelleTumTablolar(){
    gosterOgrenciTablo();
    hocaTablosuGoster();
    
    const ogrenciTablo = document.getElementById("ogrenciBosSaatTablo");
    if(ogrenciTablo && ogrenciTablo.style.display === "block") {
      gosterBosSaatlerTablo("ogrenciBosSaatTablo");
    }
  }

  // Firebase'den Veri Yükle
  loadData();
});

// Global Fonksiyonlar
window.hocaDuzenle = function(index){
  database.ref('ogrenciKayitlar').once('value').then((snapshot) => {
    const kayitlar = snapshot.val() || [];
    const k = kayitlar[index];
    const form = document.getElementById("hocaDuzenleFormDiv");
    if(!form) return;
    
    form.style.display = "block";
    document.getElementById("hocaDuzenleOgrenci").value = k.ad;
    document.getElementById("hocaDuzenleTelefon").value = k.tel;
    document.getElementById("hocaDuzenleGun").value = k.gun;
    document.getElementById("hocaDuzenleSaat").value = k.saat;
    document.getElementById("hocaDuzenleIndex").value = index;
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
};

window.hocaSil = function(index){
  if(!confirm("Bu kaydı silmek istediğinize emin misiniz?")) return;
  
  database.ref('ogrenciKayitlar').once('value').then((snapshot) => {
    const kayitlar = snapshot.val() || [];
    kayitlar.splice(index, 1);
    database.ref('ogrenciKayitlar').set(kayitlar).then(() => {
      alert("✅ Kayıt silindi!");
    });
  });
};

window.tumKayitlariSil = function(){
  database.ref('ogrenciKayitlar').once('value').then((snapshot) => {
    const kayitlar = snapshot.val() || [];
    if(kayitlar.length === 0) return alert("⚠️ Silinecek kayıt yok!");
    
    if(!confirm(`⚠️ DİKKAT!\n\n${kayitlar.length} randevu silinecek!\n\nDevam edilsin mi?`)) return;
    if(!confirm("🔴 SON UYARI!\n\nTüm veriler kalıcı olarak silinecek!\n\nEmin misiniz?")) return;
    
    database.ref('ogrenciKayitlar').set([]).then(() => {
      alert("✅ Tüm kayıtlar silindi!");
    });
  });
};

window.hocaCikisYap = function(){
  if(!confirm("🚪 Çıkış yapmak istediğinize emin misiniz?")) return;
  localStorage.removeItem("hocaGirisYapti");
  alert("👋 Başarıyla çıkış yaptınız!");
  location.reload();
};