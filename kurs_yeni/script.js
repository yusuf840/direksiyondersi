document.addEventListener("DOMContentLoaded", function () {
  const slotler = ["08:00","09:00","10:00","11:00","13:00","14:00","15:00","16:00","17:00"];
  const tumGunler = ["Pazartesi","Salı","Çarşamba","Perşembe","Cuma","Cumartesi"];

  // Panel ve butonlar
  const ogrenciBtn = document.getElementById("ogrenciBtn");
  const hocaBtn = document.getElementById("hocaBtn");
  const ogrenciPanel = document.getElementById("ogrenciPanel");
  const hocaPanel = document.getElementById("hocaPanel");
  const hocaTabloDiv = document.getElementById("hocaTabloDiv");

  // Öğrenci giriş bilgisi
  let girisYapanOgrenci = null;

  // Panel geçişleri
  if(ogrenciBtn) ogrenciBtn.addEventListener("click", () => switchPanel("ogrenci"));
  if(hocaBtn) hocaBtn.addEventListener("click", () => switchPanel("hoca"));
  
  function switchPanel(panel) {
    if(ogrenciPanel) ogrenciPanel.style.display = panel === "ogrenci" ? "block" : "none";
    if(hocaPanel) hocaPanel.style.display = panel === "hoca" ? "block" : "none";
    if(ogrenciBtn) ogrenciBtn.classList.toggle("active", panel === "ogrenci");
    if(hocaBtn) hocaBtn.classList.toggle("active", panel === "hoca");
  }

  // ------------------- LocalStorage Yardımcı Fonksiyonları -------------------
  function getKayitlar() { return JSON.parse(localStorage.getItem("ogrenciKayitlar") || "[]"); }
  function setKayitlar(kayitlar) { localStorage.setItem("ogrenciKayitlar", JSON.stringify(kayitlar)); }

  // ------------------- Boş Saatleri Liste Gösterme -------------------
  function gosterBosSaatler(listeElementi) {
    const kayitlar = getKayitlar();
    const bosSaatlerDetay = {};
    tumGunler.forEach(gun => {
      bosSaatlerDetay[gun] = slotler.filter(saat => !kayitlar.some(k => k.gun === gun && k.saat === saat));
    });

    listeElementi.innerHTML = "";
    Object.keys(bosSaatlerDetay).forEach(gun => {
      if(bosSaatlerDetay[gun].length > 0){
        const li = document.createElement("li");
        li.textContent = `${gun}: ${bosSaatlerDetay[gun].join(", ")}`;
        listeElementi.appendChild(li);
      }
    });
  }

  // ------------------- Boş Saatleri Görsel Gösterme (Hoca) -------------------
  function gosterBosSaatlerHocaGorsel() {
    const kayitlar = getKayitlar();
    const bosSaatTablo = document.getElementById("hocaBosSaatTablo");
    if(!bosSaatTablo) return;
    bosSaatTablo.innerHTML = "";

    const table = document.createElement("table");
    const thead = document.createElement("thead");
    const trHead = document.createElement("tr");
    trHead.innerHTML = "<th>Gün</th>" + slotler.map(s => `<th>${s}</th>`).join("");
    thead.appendChild(trHead);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    tumGunler.forEach(gun => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${gun}</td>` + slotler.map(s => {
        const dolu = kayitlar.some(k => k.gun === gun && k.saat === s);
        return `<td style="background-color:${dolu ? "#ff4d4d" : "#4CAF50"}; color:white;">${dolu ? "Dolu" : "Boş"}</td>`;
      }).join("");
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    bosSaatTablo.appendChild(table);
  }

  // ------------------- Öğrenci Paneli -------------------
  const ogrenciLoginForm = document.getElementById("ogrenciLoginForm");
  const ogrenciFormDiv = document.getElementById("ogrenciFormDiv");
  const ogrenciLoginDiv = document.getElementById("ogrenciLoginDiv");
  const ogrenciBosSaatListe = document.getElementById("ogrenciBosSaatListe");
  const ogrenciBosSaatBtn = document.getElementById("bosSaatBtn");

  ogrenciLoginForm?.addEventListener("submit", function(e){
    e.preventDefault();
    const ad = document.getElementById("loginAdSoyad").value.trim();
    const tel = document.getElementById("loginTelefon").value.trim();
    if(!ad || !tel) return alert("Lütfen tüm alanları doldurun!");

    girisYapanOgrenci = {ad, tel};
    ogrenciLoginDiv.style.display = "none";
    ogrenciFormDiv.style.display = "block";
    document.getElementById("ogrenciAdi").value = ad;
    document.getElementById("telefon").value = tel;
    document.getElementById("ogrenciAdi").disabled = true;
    document.getElementById("telefon").disabled = true;

    gosterOgrenciTablo();
    if(ogrenciBosSaatListe) gosterBosSaatler(ogrenciBosSaatListe);
  });

  document.getElementById("formUygunluk")?.addEventListener("submit", function(e){
    e.preventDefault();
    const ad = girisYapanOgrenci.ad; 
    const tel = girisYapanOgrenci.tel;
    const gun = document.getElementById("gun").value;
    const saat = document.getElementById("saat").value;
    const duzenleIndex = parseInt(document.getElementById("duzenleIndex")?.value || -1);

    if(!ad || !tel || !gun || !saat) return alert("Lütfen tüm alanları doldurun!");

    const kayitlar = getKayitlar();
    const dolu = kayitlar.find((k,i)=>k.gun===gun && k.saat===saat && i!==duzenleIndex);
    if(dolu){
      const bosSaat = slotler.find(s=>!kayitlar.some((k,i)=>k.gun===gun && k.saat===s && i!==duzenleIndex));
      return alert(bosSaat ? `Seçtiğiniz saat dolu. En yakın boş saat: ${bosSaat}` : "Maalesef bugün için boş slot yok.");
    }

    if(duzenleIndex >= 0) kayitlar[duzenleIndex] = {ad,tel,gun,saat};
    else kayitlar.push({ad,tel,gun,saat});
    setKayitlar(kayitlar);

    document.getElementById("gun").selectedIndex = 0;
    document.getElementById("saat").selectedIndex = 0;
    document.getElementById("duzenleIndex").value = "-1";

    guncelleTumTablolar();
  });

  function gosterOgrenciTablo(){
    const tbody = document.getElementById("ogrenciTabloVeri");
    if(!tbody) return;
    tbody.innerHTML = "";
    const kayitlar = getKayitlar();
    const kendiKayitlari = kayitlar.filter(k=>k.ad===girisYapanOgrenci?.ad && k.tel===girisYapanOgrenci?.tel);

    kendiKayitlari.forEach((k,index)=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${k.ad}</td><td>${k.tel}</td><td>${k.gun}</td><td>${k.saat}</td>
      <td><button onclick="duzenle(${index})">Düzenle</button>
      <button onclick="sil(${index})">Sil</button></td>`;
      tbody.appendChild(tr);
    });
  }

  window.duzenle = function(index){
    const kayitlar = getKayitlar();
    const k = kayitlar.filter(k=>k.ad===girisYapanOgrenci?.ad && k.tel===girisYapanOgrenci?.tel)[index];
    const globalIndex = kayitlar.indexOf(k);
    document.getElementById("gun").value = k.gun;
    document.getElementById("saat").value = k.saat;
    document.getElementById("duzenleIndex").value = globalIndex;
  };

  window.sil = function(index){
    const kayitlar = getKayitlar();
    const k = kayitlar.filter(k=>k.ad===girisYapanOgrenci?.ad && k.tel===girisYapanOgrenci?.tel)[index];
    kayitlar.splice(kayitlar.indexOf(k),1);
    setKayitlar(kayitlar);
    guncelleTumTablolar();
  };

  ogrenciBosSaatBtn?.addEventListener("click", () => {
    if(!ogrenciBosSaatListe) return;
    if(ogrenciBosSaatListe.style.display === "none") {
      gosterBosSaatler(ogrenciBosSaatListe);
      ogrenciBosSaatListe.style.display = "block";
    } else {
      ogrenciBosSaatListe.style.display = "none";
    }
  });

  // ------------------- Hoca Paneli -------------------
  const hocaLoginForm = document.getElementById("hocaLoginForm");
  const hocaBosSaatBtn = document.getElementById("hocaBosSaatBtn");
  const hocaBosSaatListe = document.getElementById("hocaBosSaatListe");
  const hocaBosSaatTablo = document.getElementById("hocaBosSaatTablo");

  hocaLoginForm?.addEventListener("submit", e => {
    e.preventDefault();
    if(document.getElementById("sifre").value === "12345"){
      hocaTabloDiv.style.display = "block";
      hocaLoginForm.style.display = "none";
      hocaTablosuGoster();
    } else alert("Şifre yanlış!");
  });

  function hocaTablosuGoster(){
    const tbody = document.getElementById("tabloVeri");
    if(!tbody) return;
    tbody.innerHTML = "";
    const kayitlar = getKayitlar();

    kayitlar.forEach((k,index)=>{
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${k.gun}</td><td>${k.saat}</td><td>${k.ad}</td><td>${k.tel}</td>
        <td><button onclick="hocaDuzenle(${index})">Düzenle</button>
            <button onclick="hocaSil(${index})">Sil</button></td>`;
      tbody.appendChild(tr);
    });

    // İstatistikler
    const ogrenciler = {};
    kayitlar.forEach(k => ogrenciler[k.ad + "|" + k.tel] = true);
    document.getElementById("toplamOgrenci").innerText = `📆 Toplam Öğrenci: ${Object.keys(ogrenciler).length}`;

    const gunSayilari = {};
    kayitlar.forEach(k => gunSayilari[k.gun] = (gunSayilari[k.gun]||0)+1);
    document.getElementById("enYogunGun").innerText = `🧩 En Yoğun Gün: ${Object.keys(gunSayilari).length ? Object.keys(gunSayilari).reduce((a,b)=>gunSayilari[a]>gunSayilari[b]?a:b) : "-"}`;

    // Boş saatleri güncelle (hem liste hem görsel tablo)
    if(hocaBosSaatListe) gosterBosSaatler(hocaBosSaatListe);
    gosterBosSaatlerHocaGorsel();
    const bosSaatToplam = Object.values(tumGunler.reduce((acc,gun)=>{
      acc[gun] = slotler.filter(saat => !kayitlar.some(k => k.gun === gun && k.saat === saat));
      return acc;
    },{})).reduce((sum,arr)=>sum+arr.length,0);
    document.getElementById("bosSaatler").innerText = `⏰ Boş Saatler: ${bosSaatToplam}`;
  }

  // HOCA DÜZENLEME FORM SUBMIT
  document.getElementById("hocaDuzenleForm")?.addEventListener("submit", function(e){
    e.preventDefault();
    
    const index = parseInt(document.getElementById("hocaDuzenleIndex").value);
    const yeniGun = document.getElementById("hocaDuzenleGun").value;
    const yeniSaat = document.getElementById("hocaDuzenleSaat").value;
    
    const kayitlar = getKayitlar();
    
    // Çakışma kontrolü (kendi kaydı hariç)
    const cakisan = kayitlar.find((k, i) => 
      i !== index && k.gun === yeniGun && k.saat === yeniSaat
    );
    
    if(cakisan) {
      alert(`❌ ${yeniGun} günü ${yeniSaat} saatinde başka bir öğrenci var!\n\nÖğrenci: ${cakisan.ad}\nTelefon: ${cakisan.tel}`);
      return;
    }
    
    // Güncelleme yap
    kayitlar[index].gun = yeniGun;
    kayitlar[index].saat = yeniSaat;
    setKayitlar(kayitlar);
    
    // Formu gizle ve sıfırla
    document.getElementById("hocaDuzenleFormDiv").style.display = "none";
    document.getElementById("hocaDuzenleIndex").value = "-1";
    
    // Tabloları güncelle
    guncelleTumTablolar();
    
    alert("✅ Randevu başarıyla güncellendi!");
  });

  hocaBosSaatBtn?.addEventListener("click", () => {
    if(hocaBosSaatTablo && (hocaBosSaatTablo.style.display === "none" || hocaBosSaatTablo.style.display === "")) {
      gosterBosSaatlerHocaGorsel();
      hocaBosSaatTablo.style.display = "block";
    } else if(hocaBosSaatTablo) {
      hocaBosSaatTablo.style.display = "none";
    }
  });

  // ------------------- Ortak Fonksiyonlar -------------------
  function guncelleTumTablolar(){
    gosterOgrenciTablo();
    hocaTablosuGoster();
    if(ogrenciBosSaatListe) gosterBosSaatler(ogrenciBosSaatListe);
  }

  // Arama
  document.getElementById("searchInput")?.addEventListener("input", function(){
    const val = this.value.toLowerCase();
    document.querySelectorAll("#tabloVeri tr").forEach(r=>{
      r.style.display = r.innerText.toLowerCase().includes(val) ? "" : "none";
    });
  });

  // PDF
  document.getElementById("pdfBtn")?.addEventListener("click", function(){
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const kayitlar = getKayitlar();
    doc.autoTable({ head:[["Gün","Saat","Öğrenci","Telefon"]], body:kayitlar.map(k=>[k.gun,k.saat,k.ad,k.tel]) });
    doc.save("ders_programi.pdf");
  });

  // Excel
  document.getElementById("excelBtn")?.addEventListener("click", function(){
    const kayitlar = getKayitlar();
    const ws_data = [["Gün","Saat","Öğrenci","Telefon"], ...kayitlar.map(k=>[k.gun,k.saat,k.ad,k.tel])];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(ws_data),"DersProgrami");
    XLSX.writeFile(wb,"ders_programi.xlsx");
  });

  // Başlangıçta tabloları yükle
  guncelleTumTablolar();
  
}); // DOMContentLoaded KAPANIŞI BURASI

// =========== BUNDAN SONRA WINDOW FONKSİYONLARI ===========

window.hocaDuzenle = function(index){
  const kayitlar = JSON.parse(localStorage.getItem("ogrenciKayitlar") || "[]");
  const k = kayitlar[index];
  
  const form = document.getElementById("hocaDuzenleFormDiv");
  if(!form) {
    console.error("hocaDuzenleFormDiv bulunamadı!");
    return;
  }
  
  form.style.display = "block";
  
  document.getElementById("hocaDuzenleOgrenci").value = k.ad;
  document.getElementById("hocaDuzenleTelefon").value = k.tel;
  document.getElementById("hocaDuzenleGun").value = k.gun;
  document.getElementById("hocaDuzenleSaat").value = k.saat;
  document.getElementById("hocaDuzenleIndex").value = index;
  
  form.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

window.hocaSil = function(index){
  const kayitlar = JSON.parse(localStorage.getItem("ogrenciKayitlar") || "[]");
  kayitlar.splice(index,1);
  localStorage.setItem("ogrenciKayitlar", JSON.stringify(kayitlar));
  
  // Sayfa yenilendiğinde tabloyu güncelle
  location.reload();
};