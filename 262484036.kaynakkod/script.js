(function () {
  'use strict';

  const API_ADRES = '';
  const JETON_ANAHTAR = 'examtrack-token';
  const KULLANICI_ANAHTAR = 'examtrack-user';

  const CALISMA_SANIYE = 25 * 60;
  const MOLA_SANIYE = 5 * 60;

  let jeton = localStorage.getItem(JETON_ANAHTAR);
  let aktifKullanici = null;
  let gunlukHedef = 200;
  let bugunCozulen = 0;
  let sayacSaniye = CALISMA_SANIYE;
  let sayacZamanlayici = null;
  let calisiyorMu = false;
  let molaMi = false;
  let haftaPomodoro = 0;
  let haftaDeneme = 0;

  let ilerlemeListesi = [];
  let zayifKonular = [];
  let haftalikProgram = [];
  let haftalikSorular = { labels: ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'], data: [0, 0, 0, 0, 0, 0, 0] };
  let denemeGecmisi = { labels: [], math: [], turkish: [] };

  let haftalikGrafik = null;
  let denemeGrafik = null;
  let panelHazir = false;
  let seciliTema = null;


  // htmldeki elementleri buraya aldım
  const girisEkrani = document.getElementById('authScreen');
  const uygulamaAlani = document.getElementById('appWrapper');
  const sekmeGiris = document.getElementById('tabLogin');
  const sekmeKayit = document.getElementById('tabRegister');
  const girisFormu = document.getElementById('loginForm');
  const kayitFormu = document.getElementById('registerForm');
  const girisHataAlani = document.getElementById('authError');
  const girisTemaButonu = document.getElementById('authThemeToggle');
  const cikisButonu = document.getElementById('logoutBtn');
  const cikisButonuMasa = document.getElementById('logoutBtnDesktop');
  const kullaniciSelami = document.getElementById('userGreeting');
  const kullaniciSelamiMasa = document.getElementById('userGreetingDesktop');

  const temaButonu = document.getElementById('themeToggle');
  const temaButonuMasa = document.getElementById('themeToggleDesktop');
  const sayacGoster = document.getElementById('pomodoroDisplay');
  const sayacModu = document.getElementById('pomodoroMode');
  const sayacBaslat = document.getElementById('pomodoroStart');
  const sayacDurdur = document.getElementById('pomodoroPause');
  const sayacSifirla = document.getElementById('pomodoroReset');
  const bugunCozulenEl = document.getElementById('todaySolved');
  const bugunHedefEl = document.getElementById('todayTarget');
  const hedefDolgu = document.getElementById('goalProgressFill');
  const hedefKalan = document.getElementById('goalRemaining');
  const soruFormu = document.getElementById('questionForm');
  const dersSecimi = document.getElementById('subjectSelect');
  const soruAdedi = document.getElementById('questionCount');
  const konuAlani = document.getElementById('topicInput');
  const konuHedefAlani = document.getElementById('topicGoalInput');
  const yanlisKutusu = document.getElementById('failedCheckbox');
  const ilerlemeAlani = document.getElementById('progressList');
  const denemeFormu = document.getElementById('examForm');
  const zayifKonuListesi = document.getElementById('weakTopicsList');
  const zayifKonuBos = document.getElementById('weakTopicsEmpty');
  const haftaToplamEl = document.getElementById('weekTotalQuestions');
  const haftaPomodoroEl = document.getElementById('weekPomodoros');
  const haftaDenemeEl = document.getElementById('weekExams');
  const zayifKonuSayisiEl = document.getElementById('weakTopicCount');
  const grafikYorumu = document.getElementById('chartInsight');
  const programTablosu = document.getElementById('scheduleBody');
  const programAcButonu = document.getElementById('openScheduleModal');
  const programPenceresi = document.getElementById('scheduleModal');
  const programKapatButonu = document.getElementById('closeScheduleModal');
  const programIptalButonu = document.getElementById('cancelScheduleModal');
  const programFormu = document.getElementById('scheduleForm');
  const programFormListesi = document.getElementById('scheduleFormList');
  const hedefDuzenleButonu = document.getElementById('toggleGoalEdit');
  const hedefDuzenleFormu = document.getElementById('goalEditForm');
  const gunlukHedefAlani = document.getElementById('dailyGoalInput');


  // sunucuya istek atan genel fonksiyon
  async function sunucuIstegi(adres, secenekler) {
    const ayarlar = secenekler || {};
    const basliklar = Object.assign({ 'Content-Type': 'application/json' }, ayarlar.headers || {});

    if (jeton) {
      basliklar.Authorization = 'Bearer ' + jeton;
    }

    const cevap = await fetch(API_ADRES + adres, {
      method: ayarlar.method || 'GET',
      headers: basliklar,
      body: ayarlar.body ? JSON.stringify(ayarlar.body) : undefined,
    });

    let veri = {};
    try {
      veri = await cevap.json();
    } catch {
      veri = {};
    }

    if (!cevap.ok) {
      const mesaj = veri.error || ('İstek başarısız (HTTP ' + cevap.status + '). Sunucunun çalıştığından emin olun.');
      throw new Error(mesaj);
    }

    return veri;
  }

  function girisHatasiGoster(mesaj) {
    girisHataAlani.textContent = mesaj;
    girisHataAlani.classList.remove('hidden');
  }

  function girisHatasiGizle() {
    girisHataAlani.classList.add('hidden');
    girisHataAlani.textContent = '';
  }

  function girisEkraniniAc() {
    girisEkrani.classList.remove('hidden');
    uygulamaAlani.classList.add('hidden');
  }

  function paneliGoster() {
    girisEkrani.classList.add('hidden');
    uygulamaAlani.classList.remove('hidden');
    kullaniciSelaminiGuncelle();
  }

  function kullaniciSelaminiGuncelle() {
    const ad = aktifKullanici ? aktifKullanici.username : '';
    const metin = ad ? 'Merhaba, ' + ad : '';
    kullaniciSelami.textContent = metin;
    kullaniciSelamiMasa.textContent = metin;
  }

  // giriş yapınca tokenı kaydediyoruz
  function oturumuKaydet(yeniJeton, kullanici) {
    jeton = yeniJeton;
    aktifKullanici = kullanici;
    localStorage.setItem(JETON_ANAHTAR, yeniJeton);
    localStorage.setItem(KULLANICI_ANAHTAR, JSON.stringify(kullanici));
  }

  function oturumuTemizle() {
    jeton = null;
    aktifKullanici = null;
    localStorage.removeItem(JETON_ANAHTAR);
    localStorage.removeItem(KULLANICI_ANAHTAR);
    pomodoroDurdur();
    pomodoroSifirla();
    panelHazir = false;
  }

  function cikisYap() {
    oturumuTemizle();
    girisEkraniniAc();
    girisHatasiGizle();
  }


  // giriş kayıt sekmeleri
  sekmeGiris.addEventListener('click', function () {
    sekmeGiris.classList.add('active');
    sekmeKayit.classList.remove('active');
    girisFormu.classList.remove('hidden');
    kayitFormu.classList.add('hidden');
    girisHatasiGizle();
  });

  sekmeKayit.addEventListener('click', function () {
    sekmeKayit.classList.add('active');
    sekmeGiris.classList.remove('active');
    kayitFormu.classList.remove('hidden');
    girisFormu.classList.add('hidden');
    girisHatasiGizle();
  });

  girisFormu.addEventListener('submit', async function (e) {
    e.preventDefault();
    girisHatasiGizle();

    const eposta = document.getElementById('loginEmail').value.trim();
    const sifre = document.getElementById('loginPassword').value;

    try {
      const veri = await sunucuIstegi('/api/auth/login', {
        method: 'POST',
        body: { email: eposta, password: sifre },
      });
      oturumuKaydet(veri.token, veri.user);
      await paneleGir();
    } catch (hata) {
      girisHatasiGoster(hata.message);
    }
  });

  kayitFormu.addEventListener('submit', async function (e) {
    e.preventDefault();
    girisHatasiGizle();

    const kullaniciAdi = document.getElementById('registerUsername').value.trim();
    const eposta = document.getElementById('registerEmail').value.trim();
    const sifre = document.getElementById('registerPassword').value;
    const sifreTekrar = document.getElementById('registerPasswordConfirm').value;

    if (sifre !== sifreTekrar) {
      girisHatasiGoster('Şifreler eşleşmiyor.');
      return;
    }

    try {
      const veri = await sunucuIstegi('/api/auth/register', {
        method: 'POST',
        body: { username: kullaniciAdi, email: eposta, password: sifre },
      });
      oturumuKaydet(veri.token, veri.user);
      await paneleGir();
    } catch (hata) {
      girisHatasiGoster(hata.message);
    }
  });

  cikisButonu.addEventListener('click', cikisYap);
  cikisButonuMasa.addEventListener('click', cikisYap);

  async function paneleGir() {
    paneliGoster();
    await panelVerileriniYukle();
    if (!panelHazir) {
      panelOzellikleriniBaslat();
      panelHazir = true;
    }
  }

  // sayfa açılınca eski oturum var mı bakıyor
  async function oturumKontrol() {
    if (!jeton) {
      girisEkraniniAc();
      return;
    }

    try {
      const kayitliKullanici = localStorage.getItem(KULLANICI_ANAHTAR);
      if (kayitliKullanici) {
        aktifKullanici = JSON.parse(kayitliKullanici);
      }
      const veri = await sunucuIstegi('/api/auth/me');
      aktifKullanici = veri.user;
      localStorage.setItem(KULLANICI_ANAHTAR, JSON.stringify(veri.user));
      await paneleGir();
    } catch {
      oturumuTemizle();
      girisEkraniniAc();
    }
  }


  // dashboard verilerini çekiyor
  async function panelVerileriniYukle() {
    const veri = await sunucuIstegi('/api/dashboard');

    gunlukHedef = veri.dailyGoal;
    bugunCozulen = veri.todaySolved;
    ilerlemeListesi = veri.progressItems.map(function (k) {
      return { id: String(k.id), subject: k.subject, topic: k.topic, current: k.current, target: k.target };
    });
    zayifKonular = veri.weakTopics.map(function (k) {
      return { id: String(k.id), subject: k.subject, topic: k.topic };
    });
    haftalikProgram = veri.weeklySchedule || [];
    haftalikSorular = veri.weeklyQuestions;
    denemeGecmisi = veri.examHistory;
    haftaPomodoro = veri.weekPomodoros;
    haftaDeneme = veri.weekExams;

    gunlukHedefiGuncelle();
    programTablosunuCiz();
    ilerlemeCubuklariniCiz();
    zayifKonulariCiz();
    haftaToplamEl.textContent = veri.weekTotal;
    haftaPomodoroEl.textContent = haftaPomodoro;
    haftaDenemeEl.textContent = haftaDeneme;
    grafikYorumunuGuncelle();

    grafikleriGuncelle();
  }

  // grafikleri güncelle
  function grafikleriGuncelle() {
    if (haftalikGrafik) {
      haftalikGrafik.data.labels = haftalikSorular.labels;
      haftalikGrafik.data.datasets[0].data = haftalikSorular.data;
      haftalikGrafik.update('none');
    }
    if (denemeGrafik) {
      denemeGrafik.data.labels = denemeGecmisi.labels;
      denemeGrafik.data.datasets[0].data = denemeGecmisi.math;
      denemeGrafik.data.datasets[1].data = denemeGecmisi.turkish;
      denemeGrafik.update('none');
    }
  }


  // karanlık aydınlık tema
  function tercihEdilenTema() {
    const kayitli = localStorage.getItem('examtrack-theme');
    if (kayitli === 'light' || kayitli === 'dark') return kayitli;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function temayiUygula(tema, grafikZorla) {
    if (tema !== 'light' && tema !== 'dark') tema = 'light';
    if (seciliTema === tema && !grafikZorla) return;

    seciliTema = tema;
    document.documentElement.setAttribute('data-theme', tema);
    localStorage.setItem('examtrack-theme', tema);

    if (haftalikGrafik || denemeGrafik) {
      grafikTemasiniGuncelle();
    }
  }

  function temayiDegistir() {
    temayiUygula(seciliTema === 'light' ? 'dark' : 'light', true);
  }

  girisTemaButonu.addEventListener('click', temayiDegistir);
  temaButonu.addEventListener('click', temayiDegistir);
  temaButonuMasa.addEventListener('click', temayiDegistir);
  temayiUygula(tercihEdilenTema(), false);


  // pomodoro sayacı
  function zamaniFormatla(toplamSaniye) {
    const dakika = Math.floor(toplamSaniye / 60);
    const saniye = toplamSaniye % 60;
    return String(dakika).padStart(2, '0') + ':' + String(saniye).padStart(2, '0');
  }

  function pomodoroGoster() {
    sayacGoster.textContent = zamaniFormatla(sayacSaniye);
    sayacModu.textContent = molaMi ? 'Mola Modu ☕' : 'Çalışma Modu 📚';
    sayacGoster.classList.toggle('pomodoro-break', molaMi);
  }

  async function pomodoroDongusuBitti() {
    if (molaMi) {
      molaMi = false;
      sayacSaniye = CALISMA_SANIYE;
      bildirimGoster('Mola bitti! Çalışmaya devam.');
    } else {
      molaMi = true;
      sayacSaniye = MOLA_SANIYE;
      bildirimGoster('Harika! 5 dakika mola zamanı.');
      try {
        const veri = await sunucuIstegi('/api/pomodoro', { method: 'POST' });
        haftaPomodoro = veri.weekPomodoros;
        haftaPomodoroEl.textContent = haftaPomodoro;
      } catch {
        haftaPomodoro += 1;
        haftaPomodoroEl.textContent = haftaPomodoro;
      }
    }
    pomodoroGoster();
  }

  function bildirimGoster(mesaj) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('ExamTrack', { body: mesaj });
    }
  }

  function pomodoroTikla() {
    if (sayacSaniye <= 0) {
      pomodoroDongusuBitti();
      return;
    }
    sayacSaniye -= 1;
    pomodoroGoster();
  }

  function pomodoroBaslat() {
    if (calisiyorMu) return;
    calisiyorMu = true;
    sayacZamanlayici = setInterval(pomodoroTikla, 1000);
  }

  function pomodoroDurdur() {
    calisiyorMu = false;
    clearInterval(sayacZamanlayici);
    sayacZamanlayici = null;
  }

  function pomodoroSifirla() {
    pomodoroDurdur();
    molaMi = false;
    sayacSaniye = CALISMA_SANIYE;
    pomodoroGoster();
  }


  // haftalık ders programı tablosu
  function programTablosunuCiz() {
    programTablosu.innerHTML = '';
    if (!haftalikProgram.length) {
      programTablosu.innerHTML = '<tr><td colspan="2" class="empty-state">Program yükleniyor...</td></tr>';
      return;
    }
    haftalikProgram.forEach(function (oge) {
      const satir = document.createElement('tr');
      satir.innerHTML =
        '<td>' + htmlTemizle(oge.dayName) + '</td>' +
        '<td>' + htmlTemizle(oge.lesson) + '</td>';
      programTablosu.appendChild(satir);
    });
  }

  function programFormunuDoldur() {
    programFormListesi.innerHTML = '';
    haftalikProgram.forEach(function (oge) {
      const satir = document.createElement('div');
      satir.className = 'schedule-form-item';

      const etiket = document.createElement('label');
      etiket.setAttribute('for', 'schedule-day-' + oge.day);
      etiket.textContent = oge.dayName;

      const alan = document.createElement('input');
      alan.type = 'text';
      alan.id = 'schedule-day-' + oge.day;
      alan.dataset.day = String(oge.day);
      alan.value = oge.lesson;
      alan.placeholder = 'Örn: Matematik — Türev';
      alan.required = true;

      satir.appendChild(etiket);
      satir.appendChild(alan);
      programFormListesi.appendChild(satir);
    });
  }

  function programDuzenleAc() {
    programFormunuDoldur();
    programPenceresi.classList.remove('hidden');
  }

  function programDuzenleKapat() {
    programPenceresi.classList.add('hidden');
  }

  async function programKaydet(e) {
    e.preventDefault();
    const alanlar = programFormListesi.querySelectorAll('input[data-day]');
    const program = [];
    alanlar.forEach(function (alan) {
      program.push({
        day: parseInt(alan.dataset.day, 10),
        lesson: alan.value.trim(),
      });
    });

    try {
      const veri = await sunucuIstegi('/api/schedule', {
        method: 'PUT',
        body: { schedule: program },
      });
      haftalikProgram = veri.weeklySchedule;
      programTablosunuCiz();
      programDuzenleKapat();
    } catch (hata) {
      alert(hata.message);
    }
  }


  // günlük soru hedefi
  function bugunToplamCozulen() {
    return bugunCozulen;
  }

  function gunlukHedefiGuncelle() {
    const toplamCozulen = bugunToplamCozulen();
    bugunCozulenEl.textContent = toplamCozulen;
    bugunHedefEl.textContent = gunlukHedef;
    gunlukHedefAlani.value = gunlukHedef;
    const yuzde = gunlukHedef > 0 ? Math.min((toplamCozulen / gunlukHedef) * 100, 100) : 0;
    hedefDolgu.style.width = yuzde + '%';
    const kalan = Math.max(gunlukHedef - toplamCozulen, 0);
    if (kalan === 0 && toplamCozulen > 0) {
      hedefKalan.textContent = 'Tebrikler! Günlük genel hedefini tamamladın! 🎉';
    } else if (toplamCozulen === 0) {
      hedefKalan.textContent = 'Tüm derslerden çözdüğünüz sorular burada toplanır.';
    } else {
      hedefKalan.textContent = 'Genel kota: ' + toplamCozulen + '/' + gunlukHedef + ' — ' + kalan + ' soru kaldı 💪';
    }
  }

  function hedefFormunuAcKapat() {
    hedefDuzenleFormu.classList.toggle('hidden');
    if (!hedefDuzenleFormu.classList.contains('hidden')) {
      gunlukHedefAlani.value = gunlukHedef;
      gunlukHedefAlani.focus();
    }
  }

  async function hedefKaydet(e) {
    e.preventDefault();
    const yeniHedef = parseInt(gunlukHedefAlani.value, 10);
    if (!yeniHedef || yeniHedef < 1 || yeniHedef > 2000) {
      alert('Hedef 1 ile 2000 arasında olmalıdır.');
      return;
    }

    try {
      const veri = await sunucuIstegi('/api/daily-goal', {
        method: 'PUT',
        body: { dailyGoal: yeniHedef },
      });
      gunlukHedef = veri.dailyGoal;
      gunlukHedefiGuncelle();
      hedefDuzenleFormu.classList.add('hidden');
    } catch (hata) {
      alert(hata.message);
    }
  }


  // konu ilerleme çubukları
  function dersRengiSinifi(ders) {
    const harita = {
      'Matematik': 'math',
      'Türkçe': 'turkish',
      'Edebiyat': 'edebiyat',
      'Fizik': 'fizik',
      'Kimya': 'kimya',
      'Geometri': 'math',
    };
    return harita[ders] || 'default';
  }

  function htmlTemizle(metin) {
    const div = document.createElement('div');
    div.textContent = metin;
    return div.innerHTML;
  }

  // ilerleme kaydını silme
  async function ilerlemeyiSil(id) {
    const kayit = ilerlemeListesi.find(function (k) { return k.id === String(id); });
    const etiket = kayit ? kayit.subject + ' — ' + kayit.topic : 'bu kayıt';
    if (!confirm('"' + etiket + '" ilerleme kaydını kalıcı olarak silmek istiyor musunuz?')) {
      return;
    }

    try {
      const veri = await sunucuIstegi('/api/progress-items/' + id, { method: 'DELETE' });
      ilerlemeListesi = veri.progressItems.map(function (k) {
        return { id: String(k.id), subject: k.subject, topic: k.topic, current: k.current, target: k.target };
      });
      bugunCozulen = veri.todaySolved;
      haftalikSorular = veri.weeklyQuestions;
      haftaToplamEl.textContent = veri.weekTotal;
      ilerlemeCubuklariniCiz();
      gunlukHedefiGuncelle();
      grafikleriGuncelle();
    } catch (hata) {
      alert(hata.message);
    }
  }

  function ilerlemeCubuklariniCiz() {
    ilerlemeAlani.innerHTML = '';
    if (ilerlemeListesi.length === 0) {
      ilerlemeAlani.innerHTML = '<p class="empty-state">Henüz ilerleme kaydı yok. Soru ekleyerek başlayın.</p>';
      return;
    }
    ilerlemeListesi.forEach(function (kayit) {
      const yuzde = kayit.target > 0 ? Math.min((kayit.current / kayit.target) * 100, 100) : 0;
      const kutu = document.createElement('div');
      kutu.className = 'progress-item';
      kutu.dataset.id = kayit.id;

      const ustSatir = document.createElement('div');
      ustSatir.className = 'progress-item-top';

      const baslik = document.createElement('div');
      baslik.className = 'progress-header';
      baslik.innerHTML =
        '<span class="progress-title">' + htmlTemizle(kayit.subject) + ' — ' + htmlTemizle(kayit.topic) +
          ' <span class="progress-goal-tag">(' + kayit.current + ' / ' + kayit.target + ' Hedef)</span></span>' +
        '<span class="progress-meta">Çözülen: ' + kayit.current + ' soru · Hedef: ' + kayit.target + ' soru</span>';

      const silButonu = document.createElement('button');
      silButonu.type = 'button';
      silButonu.className = 'delete-progress-btn';
      silButonu.setAttribute('aria-label', 'İlerleme kaydını sil');
      silButonu.title = 'Sil / Kaldır';
      silButonu.textContent = '🗑️';
      silButonu.addEventListener('click', function () {
        ilerlemeyiSil(kayit.id);
      });

      ustSatir.appendChild(baslik);
      ustSatir.appendChild(silButonu);

      const cubuk = document.createElement('div');
      cubuk.className = 'progress-track';
      cubuk.innerHTML =
        '<div class="progress-fill ' + dersRengiSinifi(kayit.subject) + '" style="width:' + yuzde + '%"></div>';

      kutu.appendChild(ustSatir);
      kutu.appendChild(cubuk);
      ilerlemeAlani.appendChild(kutu);
    });
  }


  // zayıf konular listesi
  function zayifKonulariCiz() {
    zayifKonuListesi.innerHTML = '';
    zayifKonuSayisiEl.textContent = zayifKonular.length;

    if (zayifKonular.length === 0) {
      zayifKonuBos.classList.remove('hidden');
      return;
    }

    zayifKonuBos.classList.add('hidden');

    zayifKonular.forEach(function (kayit) {
      const li = document.createElement('li');
      li.className = 'weak-topic-item';
      li.dataset.id = kayit.id;
      li.innerHTML =
        '<div class="weak-topic-info">' +
          '<div class="weak-topic-subject">' + htmlTemizle(kayit.subject) + '</div>' +
          '<div class="weak-topic-name">' + htmlTemizle(kayit.topic) + '</div>' +
        '</div>' +
        '<button class="remove-topic-btn" aria-label="Konuyu tamamla ve sil" data-id="' + kayit.id + '">×</button>';
      zayifKonuListesi.appendChild(li);
    });

    document.querySelectorAll('.remove-topic-btn').forEach(function (buton) {
      buton.addEventListener('click', async function () {
        const id = buton.dataset.id;
        try {
          await sunucuIstegi('/api/weak-topics/' + id, { method: 'DELETE' });
          zayifKonular = zayifKonular.filter(function (k) { return k.id !== id; });
          zayifKonulariCiz();
        } catch (hata) {
          alert(hata.message);
        }
      });
    });
  }


  // soru ekleme formu
  async function soruEkle(e) {
    e.preventDefault();

    const ders = dersSecimi.value;
    const adet = parseInt(soruAdedi.value, 10);
    const konu = konuAlani.value.trim();
    const konuHedefi = parseInt(konuHedefAlani.value, 10);
    const yanlisVar = yanlisKutusu.checked;

    if (!ders || !adet || !konu) return;

    const konuMevcut = ilerlemeListesi.some(function (k) {
      return k.subject === ders && k.topic.toLowerCase() === konu.toLowerCase();
    });

    if (!konuMevcut && (!konuHedefi || konuHedefi < 1 || konuHedefi > 1000)) {
      alert('Yeni konu eklerken soru hedefi 1 ile 1000 arasında olmalıdır.');
      return;
    }

    try {
      await sunucuIstegi('/api/questions', {
        method: 'POST',
        body: {
          subject: ders,
          topic: konu,
          questionCount: adet,
          topicGoal: konuMevcut ? undefined : konuHedefi,
          hasFailed: yanlisVar,
        },
      });
      await panelVerileriniYukle();
      soruFormu.reset();
      yanlisKutusu.checked = false;
    } catch (hata) {
      alert(hata.message);
    }
  }


  // deneme sonucu kaydetme
  async function denemeKaydet(e) {
    e.preventDefault();

    const mat = parseFloat(document.getElementById('mathNet').value) || 0;
    const tur = parseFloat(document.getElementById('turkishNet').value) || 0;
    const fen = parseFloat(document.getElementById('scienceNet').value) || 0;
    const sos = parseFloat(document.getElementById('socialNet').value) || 0;

    if (mat === 0 && tur === 0 && fen === 0 && sos === 0) return;

    try {
      await sunucuIstegi('/api/exams', {
        method: 'POST',
        body: {
          mathNet: mat,
          turkishNet: tur,
          scienceNet: fen,
          socialNet: sos,
        },
      });
      await panelVerileriniYukle();
      denemeFormu.reset();
    } catch (hata) {
      alert(hata.message);
    }
  }

  function grafikYorumunuGuncelle() {
    const matVeri = denemeGecmisi.math;
    if (!matVeri || matVeri.length < 2) {
      grafikYorumu.textContent = 'İlk deneme sonuçlarınızı kaydedin!';
      return;
    }
    const son = matVeri[matVeri.length - 1];
    const onceki = matVeri[matVeri.length - 2];
    const fark = son - onceki;
    if (fark > 0) {
      grafikYorumu.textContent = 'Matematik Netleriniz Yükseliyor! +' + fark.toFixed(2) + ' net 📈';
    } else if (fark < 0) {
      grafikYorumu.textContent = 'Matematik netlerinde düşüş var. Zayıf konulara odaklan! 📉';
    } else {
      grafikYorumu.textContent = 'Matematik netleriniz sabit. Bir üst seviyeye geçme zamanı! 💪';
    }
  }


  // grafikleri çizen yer
  function grafikRenkleri() {
    const karanlik = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
      text: karanlik ? '#b5a8c8' : '#6b5f7a',
      grid: karanlik ? 'rgba(184, 169, 212, 0.1)' : 'rgba(184, 169, 212, 0.2)',
      lavanta: karanlik ? '#9b8bc4' : '#b8a9d4',
      gokyuzu: karanlik ? '#7eb0d8' : '#a8c8e8',
    };
  }

  function grafikleriBaslat() {
    const renkler = grafikRenkleri();

    const haftalikTuval = document.getElementById('weeklyQuestionsChart').getContext('2d');
    haftalikGrafik = new Chart(haftalikTuval, {
      type: 'bar',
      data: {
        labels: haftalikSorular.labels,
        datasets: [{
          label: 'Çözülen Soru',
          data: haftalikSorular.data,
          backgroundColor: renkler.lavanta + 'cc',
          borderColor: renkler.lavanta,
          borderWidth: 2,
          borderRadius: 8,
          borderSkipped: false,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            grid: { color: renkler.grid },
            ticks: { color: renkler.text, font: { family: 'DM Sans', size: 11 } },
          },
          y: {
            beginAtZero: true,
            grid: { color: renkler.grid },
            ticks: { color: renkler.text, font: { family: 'DM Sans', size: 11 } },
          },
        },
      },
    });

    const denemeTuval = document.getElementById('examProgressChart').getContext('2d');
    denemeGrafik = new Chart(denemeTuval, {
      type: 'line',
      data: {
        labels: denemeGecmisi.labels,
        datasets: [
          {
            label: 'Matematik Net',
            data: denemeGecmisi.math,
            borderColor: renkler.lavanta,
            backgroundColor: renkler.lavanta + '33',
            fill: true,
            tension: 0.4,
            pointRadius: 5,
            pointHoverRadius: 7,
          },
          {
            label: 'Türkçe Net',
            data: denemeGecmisi.turkish,
            borderColor: renkler.gokyuzu,
            backgroundColor: renkler.gokyuzu + '33',
            fill: true,
            tension: 0.4,
            pointRadius: 5,
            pointHoverRadius: 7,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: {
            labels: {
              color: renkler.text,
              font: { family: 'DM Sans', size: 11 },
              usePointStyle: true,
              pointStyle: 'circle',
            },
          },
        },
        scales: {
          x: {
            grid: { color: renkler.grid },
            ticks: { color: renkler.text, font: { family: 'DM Sans', size: 10 } },
          },
          y: {
            beginAtZero: true,
            grid: { color: renkler.grid },
            ticks: { color: renkler.text, font: { family: 'DM Sans', size: 11 } },
          },
        },
      },
    });
  }

  function grafikTemasiniGuncelle() {
    const renkler = grafikRenkleri();
    if (haftalikGrafik) {
      haftalikGrafik.data.datasets[0].backgroundColor = renkler.lavanta + 'cc';
      haftalikGrafik.data.datasets[0].borderColor = renkler.lavanta;
      haftalikGrafik.options.scales.x.grid.color = renkler.grid;
      haftalikGrafik.options.scales.x.ticks.color = renkler.text;
      haftalikGrafik.options.scales.y.grid.color = renkler.grid;
      haftalikGrafik.options.scales.y.ticks.color = renkler.text;
      haftalikGrafik.update('none');
    }
    if (denemeGrafik) {
      denemeGrafik.data.datasets[0].borderColor = renkler.lavanta;
      denemeGrafik.data.datasets[0].backgroundColor = renkler.lavanta + '33';
      denemeGrafik.data.datasets[1].borderColor = renkler.gokyuzu;
      denemeGrafik.data.datasets[1].backgroundColor = renkler.gokyuzu + '33';
      denemeGrafik.options.plugins.legend.labels.color = renkler.text;
      denemeGrafik.options.scales.x.grid.color = renkler.grid;
      denemeGrafik.options.scales.x.ticks.color = renkler.text;
      denemeGrafik.options.scales.y.grid.color = renkler.grid;
      denemeGrafik.options.scales.y.ticks.color = renkler.text;
      denemeGrafik.update('none');
    }
  }


  // sayfadaki butonları buraya bağladım
  function panelOzellikleriniBaslat() {
    sayacBaslat.addEventListener('click', pomodoroBaslat);
    sayacDurdur.addEventListener('click', pomodoroDurdur);
    sayacSifirla.addEventListener('click', pomodoroSifirla);
    soruFormu.addEventListener('submit', soruEkle);
    denemeFormu.addEventListener('submit', denemeKaydet);
    programAcButonu.addEventListener('click', programDuzenleAc);
    programKapatButonu.addEventListener('click', programDuzenleKapat);
    programIptalButonu.addEventListener('click', programDuzenleKapat);
    programFormu.addEventListener('submit', programKaydet);
    programPenceresi.addEventListener('click', function (e) {
      if (e.target === programPenceresi) programDuzenleKapat();
    });
    hedefDuzenleButonu.addEventListener('click', hedefFormunuAcKapat);
    hedefDuzenleFormu.addEventListener('submit', hedefKaydet);
    pomodoroGoster();
    grafikleriBaslat();
    temayiUygula(seciliTema, true);

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  oturumKontrol();

})();
