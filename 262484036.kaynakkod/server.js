// env dosyasından ayarları oku
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();

// port ve jwt ayarları
const PORT = process.env.PORT || 3000;
const JWT_GIZLI = process.env.JWT_SECRET || 'examtrack-dev-secret-change-in-production';
const JWT_SURE = '7d';

const sunucu = express();
const vtDosyaYolu = path.join(__dirname, 'examtrack.db');

let vt;


// db sorgu yardımcıları
function vtTek(sorgu, parametreler) {
  return new Promise(function (coz, reddet) {
    vt.get(sorgu, parametreler || [], function (hata, satir) {
      if (hata) reddet(hata);
      else coz(satir);
    });
  });
}

function vtTum(sorgu, parametreler) {
  return new Promise(function (coz, reddet) {
    vt.all(sorgu, parametreler || [], function (hata, satirlar) {
      if (hata) reddet(hata);
      else coz(satirlar || []);
    });
  });
}

function vtCalistir(sorgu, parametreler) {
  return new Promise(function (coz, reddet) {
    vt.run(sorgu, parametreler || [], function (hata) {
      if (hata) reddet(hata);
      else coz({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function vtExec(sorgu) {
  return new Promise(function (coz, reddet) {
    vt.exec(sorgu, function (hata) {
      if (hata) reddet(hata);
      else coz();
    });
  });
}

// sqlite dosyasını aç
function vtAc() {
  return new Promise(function (coz, reddet) {
    const baglanti = new sqlite3.Database(vtDosyaYolu, function (hata) {
      if (hata) reddet(hata);
      else coz(baglanti);
    });
  });
}

// tablo var mı kontrol
async function tabloVarMi(tabloAdi) {
  const satir = await vtTek(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
    [tabloAdi]
  );
  return !!satir;
}

// kolon var mı kontrol
async function kolonVarMi(tabloAdi, kolonAdi) {
  const satirlar = await vtTum('PRAGMA table_info(' + tabloAdi + ')');
  return satirlar.some(function (kolon) { return kolon.name === kolonAdi; });
}


// veritabanı tablolarını oluştur
async function tablolariKur() {
  await vtCalistir('PRAGMA foreign_keys = ON');

  await vtCalistir(`
    CREATE TABLE IF NOT EXISTS users (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      username        TEXT    NOT NULL UNIQUE,
      email           TEXT    NOT NULL UNIQUE,
      password_hash   TEXT    NOT NULL,
      daily_goal      INTEGER NOT NULL DEFAULT 200,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    )
  `);

  if (!(await kolonVarMi('users', 'daily_goal'))) {
    await vtCalistir('ALTER TABLE users ADD COLUMN daily_goal INTEGER NOT NULL DEFAULT 200');
    console.log('Migration: users.daily_goal kolonu eklendi.');
  }

  await vtCalistir(`
    CREATE TABLE IF NOT EXISTS question_logs (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id         INTEGER NOT NULL,
      subject         TEXT    NOT NULL,
      topic           TEXT    NOT NULL,
      question_count  INTEGER NOT NULL,
      has_failed      INTEGER NOT NULL DEFAULT 0,
      logged_at       TEXT    NOT NULL DEFAULT (date('now')),
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await vtCalistir(`
    CREATE TABLE IF NOT EXISTS progress_items (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id         INTEGER NOT NULL,
      subject         TEXT    NOT NULL,
      topic           TEXT    NOT NULL,
      current_count   INTEGER NOT NULL DEFAULT 0,
      target_count    INTEGER NOT NULL DEFAULT 50,
      updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE (user_id, subject, topic)
    )
  `);

  await vtCalistir(`
    CREATE TABLE IF NOT EXISTS exam_results (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id         INTEGER NOT NULL,
      math_net        REAL    NOT NULL DEFAULT 0,
      turkish_net     REAL    NOT NULL DEFAULT 0,
      science_net     REAL    NOT NULL DEFAULT 0,
      social_net      REAL    NOT NULL DEFAULT 0,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await vtCalistir(`
    CREATE TABLE IF NOT EXISTS weak_topics (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id         INTEGER NOT NULL,
      subject         TEXT    NOT NULL,
      topic           TEXT    NOT NULL,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE (user_id, subject, topic)
    )
  `);

  await vtCalistir(`
    CREATE TABLE IF NOT EXISTS user_stats (
      user_id         INTEGER PRIMARY KEY,
      week_pomodoros  INTEGER NOT NULL DEFAULT 0,
      updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await vtCalistir(`
    CREATE TABLE IF NOT EXISTS weekly_schedule (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id         INTEGER NOT NULL,
      day_of_week     INTEGER NOT NULL,
      lesson          TEXT    NOT NULL DEFAULT '',
      updated_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE (user_id, day_of_week)
    )
  `);

  await vtCalistir('CREATE INDEX IF NOT EXISTS idx_question_logs_user ON question_logs(user_id)');
  await vtCalistir('CREATE INDEX IF NOT EXISTS idx_question_logs_date ON question_logs(user_id, logged_at)');
  await vtCalistir('CREATE INDEX IF NOT EXISTS idx_progress_user ON progress_items(user_id)');
  await vtCalistir('CREATE INDEX IF NOT EXISTS idx_exam_user ON exam_results(user_id)');
  await vtCalistir('CREATE INDEX IF NOT EXISTS idx_weak_topics_user ON weak_topics(user_id)');
  await vtCalistir('CREATE INDEX IF NOT EXISTS idx_weekly_schedule_user ON weekly_schedule(user_id)');

  if (!(await tabloVarMi('weekly_schedule'))) {
    throw new Error('weekly_schedule tablosu oluşturulamadı.');
  }

  console.log('Veritabanı migration tamamlandı.');
}

// db bağlantısını başlat
async function veritabaniBaslat() {
  vt = await vtAc();
  await tablolariKur();

  if (fs.existsSync(path.join(__dirname, 'database.sql'))) {
    try {
      const semaSql = fs.readFileSync(path.join(__dirname, 'database.sql'), 'utf8');
      await vtExec(semaSql);
    } catch (semaHatasi) {
      console.warn('database.sql dosyası çalıştırılamadı (migration zaten uygulandı):', semaHatasi.message);
    }
  }
}


// express middleware'ler
sunucu.use(cors());
sunucu.use(express.json());
sunucu.use(express.static(__dirname));


// token kontrolü yapan middleware
function oturumKontrol(istek, yanit, devam) {
  const baslik = istek.headers.authorization;
  if (!baslik || !baslik.startsWith('Bearer ')) {
    return yanit.status(401).json({ error: 'Oturum gerekli. Lütfen giriş yapın.' });
  }
  const jeton = baslik.slice(7);
  try {
    const icerik = jwt.verify(jeton, JWT_GIZLI);
    istek.user = { id: icerik.id, username: icerik.username, email: icerik.email };
    devam();
  } catch {
    return yanit.status(401).json({ error: 'Geçersiz veya süresi dolmuş oturum.' });
  }
}

// tarih formatlama yardımcıları
function tarihYaz(tarih) {
  const yil = tarih.getFullYear();
  const ay = String(tarih.getMonth() + 1).padStart(2, '0');
  const gun = String(tarih.getDate()).padStart(2, '0');
  return yil + '-' + ay + '-' + gun;
}

function haftaBasiAl() {
  const simdi = new Date();
  const gunNo = simdi.getDay();
  const fark = gunNo === 0 ? 6 : gunNo - 1;
  const pazartesi = new Date(simdi);
  pazartesi.setDate(simdi.getDate() - fark);
  pazartesi.setHours(0, 0, 0, 0);
  return tarihYaz(pazartesi);
}

function bugunAl() {
  return tarihYaz(new Date());
}

// haftalık program günleri
const PROGRAM_GUNLERI = [
  { gun: 1, ad: 'Pazartesi', varsayilanDers: 'Matematik — Türev & İntegral' },
  { gun: 2, ad: 'Salı', varsayilanDers: 'Türkçe — Paragraf & Anlam Bilgisi' },
  { gun: 3, ad: 'Çarşamba', varsayilanDers: 'Fizik — Elektrik & Manyetizma' },
  { gun: 4, ad: 'Perşembe', varsayilanDers: 'Kimya — Organik Kimya' },
  { gun: 5, ad: 'Cuma', varsayilanDers: 'Edebiyat — Şiir & Edebi Sanatlar' },
  { gun: 6, ad: 'Cumartesi', varsayilanDers: 'Geometri — Analitik Geometri' },
  { gun: 7, ad: 'Pazar', varsayilanDers: 'Genel Tekrar & Deneme Analizi' },
];

// kullanıcı istatistik kaydı yoksa oluştur
async function istatistikOlustur(kullaniciId) {
  const kayit = await vtTek('SELECT user_id FROM user_stats WHERE user_id = ?', [kullaniciId]);
  if (!kayit) {
    await vtCalistir('INSERT INTO user_stats (user_id, week_pomodoros) VALUES (?, 0)', [kullaniciId]);
  }
}

// haftalık program yoksa varsayılanları ekle
async function haftalikProgramOlustur(kullaniciId) {
  for (let i = 0; i < PROGRAM_GUNLERI.length; i++) {
    const gunBilgi = PROGRAM_GUNLERI[i];
    const kayit = await vtTek(
      'SELECT id FROM weekly_schedule WHERE user_id = ? AND day_of_week = ?',
      [kullaniciId, gunBilgi.gun]
    );
    if (!kayit) {
      await vtCalistir(
        'INSERT INTO weekly_schedule (user_id, day_of_week, lesson) VALUES (?, ?, ?)',
        [kullaniciId, gunBilgi.gun, gunBilgi.varsayilanDers]
      );
    }
  }
}

// kullanıcının haftalık programını getir
async function haftalikProgramAl(kullaniciId) {
  await haftalikProgramOlustur(kullaniciId);
  const satirlar = await vtTum(
    `SELECT day_of_week, lesson FROM weekly_schedule
     WHERE user_id = ?
     ORDER BY day_of_week ASC`,
    [kullaniciId]
  );
  return PROGRAM_GUNLERI.map(function (gunBilgi) {
    const satir = satirlar.find(function (s) { return s.day_of_week === gunBilgi.gun; });
    return {
      day: gunBilgi.gun,
      dayName: gunBilgi.ad,
      lesson: satir ? satir.lesson : gunBilgi.varsayilanDers,
    };
  });
}

// hata mesajlarını düzenle
function hataDon(yanit, hata) {
  console.error('API Hatası:', hata.message || hata);
  const mesaj = hata.message && hata.message.indexOf('SQLITE') !== -1
    ? 'Veritabanı hatası. Sunucuyu yeniden başlatın veya yöneticiye başvurun.'
    : 'Sunucu hatası. Lütfen tekrar deneyin.';
  yanit.status(500).json({ error: mesaj });
}


// kayıt olma
sunucu.post('/api/auth/register', async function (istek, yanit) {
  try {
    const { username: kullaniciAdi, email: eposta, password: sifre } = istek.body;

    if (!kullaniciAdi || !eposta || !sifre) {
      return yanit.status(400).json({ error: 'Kullanıcı adı, e-posta ve şifre zorunludur.' });
    }
    if (kullaniciAdi.length < 3) {
      return yanit.status(400).json({ error: 'Kullanıcı adı en az 3 karakter olmalıdır.' });
    }
    if (sifre.length < 6) {
      return yanit.status(400).json({ error: 'Şifre en az 6 karakter olmalıdır.' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(eposta)) {
      return yanit.status(400).json({ error: 'Geçerli bir e-posta adresi girin.' });
    }

    const kayitliKullanici = await vtTek(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [kullaniciAdi.trim(), eposta.trim().toLowerCase()]
    );

    if (kayitliKullanici) {
      return yanit.status(409).json({ error: 'Bu kullanıcı adı veya e-posta zaten kayıtlı.' });
    }

    const sifreHash = bcrypt.hashSync(sifre, 10);
    const sonuc = await vtCalistir(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
      [kullaniciAdi.trim(), eposta.trim().toLowerCase(), sifreHash]
    );

    const kullaniciId = sonuc.lastID;
    await istatistikOlustur(kullaniciId);
    await haftalikProgramOlustur(kullaniciId);

    const jeton = jwt.sign(
      { id: kullaniciId, username: kullaniciAdi.trim(), email: eposta.trim().toLowerCase() },
      JWT_GIZLI,
      { expiresIn: JWT_SURE }
    );

    yanit.status(201).json({
      token: jeton,
      user: { id: kullaniciId, username: kullaniciAdi.trim(), email: eposta.trim().toLowerCase() },
    });
  } catch (hata) {
    hataDon(yanit, hata);
  }
});

// giriş yapınca token veriyor
sunucu.post('/api/auth/login', async function (istek, yanit) {
  try {
    const { email: eposta, password: sifre } = istek.body;

    if (!eposta || !sifre) {
      return yanit.status(400).json({ error: 'E-posta ve şifre zorunludur.' });
    }

    const kullanici = await vtTek(
      'SELECT id, username, email, password_hash FROM users WHERE email = ? OR username = ?',
      [eposta.trim().toLowerCase(), eposta.trim()]
    );

    if (!kullanici || !bcrypt.compareSync(sifre, kullanici.password_hash)) {
      return yanit.status(401).json({ error: 'E-posta veya şifre hatalı.' });
    }

    await istatistikOlustur(kullanici.id);
    await haftalikProgramOlustur(kullanici.id);

    const jeton = jwt.sign(
      { id: kullanici.id, username: kullanici.username, email: kullanici.email },
      JWT_GIZLI,
      { expiresIn: JWT_SURE }
    );

    yanit.json({
      token: jeton,
      user: { id: kullanici.id, username: kullanici.username, email: kullanici.email },
    });
  } catch (hata) {
    hataDon(yanit, hata);
  }
});

// giriş yapmış kullanıcı bilgisi
sunucu.get('/api/auth/me', oturumKontrol, async function (istek, yanit) {
  try {
    const kullanici = await vtTek(
      'SELECT id, username, email, daily_goal FROM users WHERE id = ?',
      [istek.user.id]
    );

    if (!kullanici) {
      return yanit.status(404).json({ error: 'Kullanıcı bulunamadı.' });
    }

    yanit.json({ user: kullanici });
  } catch (hata) {
    hataDon(yanit, hata);
  }
});


// ana sayfa verilerini toplu getir
sunucu.get('/api/dashboard', oturumKontrol, async function (istek, yanit) {
  try {
    const kullaniciId = istek.user.id;
    const bugun = bugunAl();
    const haftaBasi = haftaBasiAl();

    const kullanici = await vtTek('SELECT daily_goal FROM users WHERE id = ?', [kullaniciId]);
    const gunlukHedef = kullanici ? kullanici.daily_goal : 200;

    const bugunSatir = await vtTek(
      `SELECT COALESCE(SUM(question_count), 0) AS total
       FROM question_logs
       WHERE user_id = ? AND logged_at = ?`,
      [kullaniciId, bugun]
    );

    const ilerlemeKayitlari = await vtTum(
      `SELECT id, subject, topic, current_count AS current, target_count AS target
       FROM progress_items
       WHERE user_id = ?
       ORDER BY updated_at DESC`,
      [kullaniciId]
    );

    const zayifKonular = await vtTum(
      `SELECT id, subject, topic
       FROM weak_topics
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [kullaniciId]
    );

    const denemeler = await vtTum(
      `SELECT id, math_net, turkish_net, science_net, social_net, created_at
       FROM exam_results
       WHERE user_id = ?
       ORDER BY created_at ASC`,
      [kullaniciId]
    );

    const gunEtiketleri = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
    const haftaBasiTarih = new Date(haftaBasi + 'T00:00:00');
    const haftalikVeri = [];

    for (let i = 0; i < 7; i++) {
      const tarih = new Date(haftaBasiTarih);
      tarih.setDate(haftaBasiTarih.getDate() + i);
      const tarihStr = tarihYaz(tarih);
      const satir = await vtTek(
        `SELECT COALESCE(SUM(question_count), 0) AS total
         FROM question_logs
         WHERE user_id = ? AND logged_at = ?`,
        [kullaniciId, tarihStr]
      );
      haftalikVeri.push(satir ? satir.total : 0);
    }

    const haftaToplam = haftalikVeri.reduce(function (a, b) { return a + b; }, 0);

    const istatistik = await vtTek('SELECT week_pomodoros FROM user_stats WHERE user_id = ?', [kullaniciId]);
    const haftaPomodoro = istatistik ? istatistik.week_pomodoros : 0;
    const haftaDeneme = denemeler.length;
    const haftalikProgram = await haftalikProgramAl(kullaniciId);

    yanit.json({
      dailyGoal: gunlukHedef,
      todaySolved: bugunSatir ? bugunSatir.total : 0,
      weeklySchedule: haftalikProgram,
      progressItems: ilerlemeKayitlari,
      weakTopics: zayifKonular,
      weeklyQuestions: { labels: gunEtiketleri, data: haftalikVeri },
      examHistory: {
        labels: denemeler.map(function (_, i) { return 'Deneme ' + (i + 1); }),
        math: denemeler.map(function (d) { return d.math_net; }),
        turkish: denemeler.map(function (d) { return d.turkish_net; }),
      },
      weekTotal: haftaToplam,
      weekPomodoros: haftaPomodoro,
      weekExams: haftaDeneme,
    });
  } catch (hata) {
    hataDon(yanit, hata);
  }
});


// çözülen soru kaydet
sunucu.post('/api/questions', oturumKontrol, async function (istek, yanit) {
  try {
    const kullaniciId = istek.user.id;
    const { subject: ders, topic: konu, questionCount: soruSayisi, topicGoal: konuHedefi, hasFailed: yanlisVar } = istek.body;

    if (!ders || !konu || !soruSayisi || soruSayisi < 1) {
      return yanit.status(400).json({ error: 'Ders, konu ve soru sayısı zorunludur.' });
    }

    const adet = parseInt(soruSayisi, 10);
    const hedef = parseInt(konuHedefi, 10);
    const bugun = bugunAl();

    await vtCalistir(
      `INSERT INTO question_logs (user_id, subject, topic, question_count, has_failed, logged_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [kullaniciId, ders, konu.trim(), adet, yanlisVar ? 1 : 0, bugun]
    );

    const mevcutKayit = await vtTek(
      `SELECT id, current_count, target_count FROM progress_items
       WHERE user_id = ? AND subject = ? AND LOWER(topic) = LOWER(?)`,
      [kullaniciId, ders, konu.trim()]
    );

    if (mevcutKayit) {
      const yeniAdet = mevcutKayit.current_count + adet;
      await vtCalistir(
        `UPDATE progress_items SET current_count = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [yeniAdet, mevcutKayit.id]
      );
    } else {
      if (!hedef || hedef < 1 || hedef > 1000) {
        return yanit.status(400).json({ error: 'Yeni konu için soru hedefi 1 ile 1000 arasında olmalıdır.' });
      }
      await vtCalistir(
        `INSERT INTO progress_items (user_id, subject, topic, current_count, target_count)
         VALUES (?, ?, ?, ?, ?)`,
        [kullaniciId, ders, konu.trim(), adet, hedef]
      );
    }

    if (yanlisVar) {
      const zayifKayit = await vtTek(
        `SELECT id FROM weak_topics
         WHERE user_id = ? AND subject = ? AND LOWER(topic) = LOWER(?)`,
        [kullaniciId, ders, konu.trim()]
      );

      if (!zayifKayit) {
        await vtCalistir(
          'INSERT INTO weak_topics (user_id, subject, topic) VALUES (?, ?, ?)',
          [kullaniciId, ders, konu.trim()]
        );
      }
    }

    yanit.status(201).json({ success: true });
  } catch (hata) {
    hataDon(yanit, hata);
  }
});


// ilerleme çubuğunu sil
sunucu.delete('/api/progress-items/:id', oturumKontrol, async function (istek, yanit) {
  try {
    const kullaniciId = istek.user.id;
    const kayitId = parseInt(istek.params.id, 10);

    const kayit = await vtTek(
      'SELECT id, subject, topic FROM progress_items WHERE id = ? AND user_id = ?',
      [kayitId, kullaniciId]
    );

    if (!kayit) {
      return yanit.status(404).json({ error: 'İlerleme kaydı bulunamadı.' });
    }

    await vtCalistir(
      'DELETE FROM question_logs WHERE user_id = ? AND subject = ? AND LOWER(topic) = LOWER(?)',
      [kullaniciId, kayit.subject, kayit.topic]
    );

    await vtCalistir('DELETE FROM progress_items WHERE id = ? AND user_id = ?', [kayitId, kullaniciId]);

    const bugun = bugunAl();
    const bugunSatir = await vtTek(
      `SELECT COALESCE(SUM(question_count), 0) AS total
       FROM question_logs WHERE user_id = ? AND logged_at = ?`,
      [kullaniciId, bugun]
    );

    const ilerlemeKayitlari = await vtTum(
      `SELECT id, subject, topic, current_count AS current, target_count AS target
       FROM progress_items WHERE user_id = ? ORDER BY updated_at DESC`,
      [kullaniciId]
    );

    const haftaBasi = haftaBasiAl();
    const haftaBasiTarih = new Date(haftaBasi + 'T00:00:00');
    const gunEtiketleri = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
    const haftalikVeri = [];

    for (let i = 0; i < 7; i++) {
      const tarih = new Date(haftaBasiTarih);
      tarih.setDate(haftaBasiTarih.getDate() + i);
      const tarihStr = tarihYaz(tarih);
      const satir = await vtTek(
        `SELECT COALESCE(SUM(question_count), 0) AS total
         FROM question_logs WHERE user_id = ? AND logged_at = ?`,
        [kullaniciId, tarihStr]
      );
      haftalikVeri.push(satir ? satir.total : 0);
    }

    const haftaToplam = haftalikVeri.reduce(function (a, b) { return a + b; }, 0);

    yanit.json({
      success: true,
      todaySolved: bugunSatir ? bugunSatir.total : 0,
      progressItems: ilerlemeKayitlari,
      weekTotal: haftaToplam,
      weeklyQuestions: { labels: gunEtiketleri, data: haftalikVeri },
    });
  } catch (hata) {
    hataDon(yanit, hata);
  }
});


// zayıf konuyu listeden çıkar
sunucu.delete('/api/weak-topics/:id', oturumKontrol, async function (istek, yanit) {
  try {
    const kullaniciId = istek.user.id;
    const konuId = parseInt(istek.params.id, 10);

    const konu = await vtTek(
      'SELECT id FROM weak_topics WHERE id = ? AND user_id = ?',
      [konuId, kullaniciId]
    );
    if (!konu) {
      return yanit.status(404).json({ error: 'Konu bulunamadı.' });
    }

    await vtCalistir('DELETE FROM weak_topics WHERE id = ? AND user_id = ?', [konuId, kullaniciId]);
    yanit.json({ success: true });
  } catch (hata) {
    hataDon(yanit, hata);
  }
});


// deneme sonucu kaydet
sunucu.post('/api/exams', oturumKontrol, async function (istek, yanit) {
  try {
    const kullaniciId = istek.user.id;
    const mat = parseFloat(istek.body.mathNet) || 0;
    const tur = parseFloat(istek.body.turkishNet) || 0;
    const fen = parseFloat(istek.body.scienceNet) || 0;
    const sos = parseFloat(istek.body.socialNet) || 0;

    if (mat === 0 && tur === 0 && fen === 0 && sos === 0) {
      return yanit.status(400).json({ error: 'En az bir net değeri girin.' });
    }

    await vtCalistir(
      `INSERT INTO exam_results (user_id, math_net, turkish_net, science_net, social_net)
       VALUES (?, ?, ?, ?, ?)`,
      [kullaniciId, mat, tur, fen, sos]
    );

    yanit.status(201).json({ success: true });
  } catch (hata) {
    hataDon(yanit, hata);
  }
});


// haftalık programı kaydet
async function programKaydet(istek, yanit) {
  try {
    const kullaniciId = istek.user.id;
    const program = istek.body.schedule;

    if (!Array.isArray(program) || program.length !== 7) {
      return yanit.status(400).json({ error: '7 günlük program verisi gönderilmelidir.' });
    }

    await haftalikProgramOlustur(kullaniciId);

    for (let i = 0; i < program.length; i++) {
      const oge = program[i];
      const gunNo = parseInt(oge.day, 10);
      const ders = (oge.lesson || '').trim();

      if (gunNo < 1 || gunNo > 7) {
        return yanit.status(400).json({ error: 'Geçersiz gün bilgisi.' });
      }
      if (!ders) {
        return yanit.status(400).json({ error: PROGRAM_GUNLERI[gunNo - 1].ad + ' için ders/konu girin.' });
      }

      await vtCalistir(
        `UPDATE weekly_schedule SET lesson = ?, updated_at = datetime('now')
         WHERE user_id = ? AND day_of_week = ?`,
        [ders, kullaniciId, gunNo]
      );
    }

    const haftalikProgram = await haftalikProgramAl(kullaniciId);
    yanit.json({ success: true, weeklySchedule: haftalikProgram });
  } catch (hata) {
    hataDon(yanit, hata);
  }
}

sunucu.put('/api/schedule', oturumKontrol, programKaydet);
sunucu.post('/api/schedule', oturumKontrol, programKaydet);


// günlük soru hedefini güncelle
async function hedefKaydet(istek, yanit) {
  try {
    const kullaniciId = istek.user.id;
    const yeniHedef = parseInt(istek.body.dailyGoal, 10);

    if (!yeniHedef || yeniHedef < 1 || yeniHedef > 2000) {
      return yanit.status(400).json({ error: 'Hedef 1 ile 2000 arasında bir sayı olmalıdır.' });
    }

    await vtCalistir('UPDATE users SET daily_goal = ? WHERE id = ?', [yeniHedef, kullaniciId]);

    yanit.json({ success: true, dailyGoal: yeniHedef });
  } catch (hata) {
    hataDon(yanit, hata);
  }
}

sunucu.put('/api/daily-goal', oturumKontrol, hedefKaydet);
sunucu.post('/api/daily-goal', oturumKontrol, hedefKaydet);


// pomodoro sayacını artır
sunucu.post('/api/pomodoro', oturumKontrol, async function (istek, yanit) {
  try {
    const kullaniciId = istek.user.id;
    await istatistikOlustur(kullaniciId);
    await vtCalistir(
      `UPDATE user_stats SET week_pomodoros = week_pomodoros + 1, updated_at = datetime('now')
       WHERE user_id = ?`,
      [kullaniciId]
    );
    const istatistik = await vtTek('SELECT week_pomodoros FROM user_stats WHERE user_id = ?', [kullaniciId]);
    yanit.json({ weekPomodoros: istatistik.week_pomodoros });
  } catch (hata) {
    hataDon(yanit, hata);
  }
});


// spa için index.html'e yönlendir
sunucu.get('*', function (istek, yanit) {
  yanit.sendFile(path.join(__dirname, 'index.html'));
});


// sunucuyu ayağa kaldırma
veritabaniBaslat()
  .then(function () {
    sunucu.listen(PORT, function () {
      console.log('ExamTrack sunucusu çalışıyor: http://localhost:' + PORT);
    });
  })
  .catch(function (hata) {
    console.error('Veritabanı başlatılamadı:', hata);
    process.exit(1);
  });
