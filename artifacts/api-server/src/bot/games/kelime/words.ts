/**
 * Oyunda kabul edilen kelimeler.
 *
 * Liste özellikle Türkçe karakterleriyle tutulur. Oyun içinde yazılan kelime
 * küçük harfe çevrilip bu listede aranır; böylece yabancı kelimeler ve
 * rastgele harf dizileri kabul edilmez.
 */
export const TURKCE_KELIMELER = [
  "ağaç", "aile", "akıl", "akşam", "alan", "altın", "amaç", "anahtar",
  "ananas", "ankara", "anlam", "araba", "armut", "arkadaş", "aslan",
  "at", "ateş", "avize", "ay", "ayakkabı", "ayna", "az", "baba",
  "bahçe", "balık", "bardak", "başarı", "başkan", "başlangıç", "bavul",
  "bayrak", "bebek", "bekçi", "belge", "beşik", "beş", "bıçak",
  "bilgi", "bilgisayar", "bilet", "bina", "bir", "biz", "boğa",
  "boş", "bulut", "burun", "büyük", "cadde", "ceket", "cevap", "cimri",
  "cumartesi", "çadır", "çalışkan", "çay", "çiçek", "çocuk", "çorap",
  "çorba", "çözüm", "dağ", "dakika", "dalga", "davet", "defter",
  "değişim", "deniz", "dere", "ders", "destek", "dil", "dost", "doktor",
  "doğum", "dolap", "dondurma", "dünya", "duvar", "el", "elma", "emek",
  "engel", "ev", "evlat", "eşya", "etek", "fabrika", "fare", "fener",
  "film", "fikir", "fırın", "futbol", "gece", "geçmiş", "gemi", "genç",
  "gezegen", "gıda", "gitar", "göl", "göz", "gökyüzü", "gömlek",
  "gün", "güneş", "haber", "hafıza", "hafta", "hak", "halı", "hane",
  "harita", "hasta", "hava", "hayal", "hayvan", "hedef", "hemşire",
  "hikaye", "hız", "hoca", "horoz", "ırmak", "ışık", "iğne", "iklim",
  "ilham", "insan", "ip", "iskele", "isim", "istasyon", "iş", "kabak",
  "kader", "kahve", "kalem", "kalp", "kamera", "kapı", "kar", "karar",
  "karga", "kart", "kasaba", "kasım", "kavun", "kayak", "kayısı",
  "kazak", "kedi", "kelime", "kemik", "kenar", "kepek", "kesme",
  "kitap", "kış", "kız", "kırmızı", "kısım", "koku", "kol", "kolay",
  "komşu", "konu", "köpek", "köprü", "köy", "kulak", "kumaş", "kutu",
  "kuş", "kütüphane", "lamba", "limon", "lokanta", "macera", "masa",
  "mayıs", "meyve", "mıknatıs", "millet", "mutfak", "mutlu", "müzik",
  "nehir", "nefes", "nesil", "nokta", "orman", "oyun", "ödev", "öğrenci",
  "öğretmen", "ölçek", "önem", "ördek", "örnek", "özgür", "pazar",
  "para", "park", "patates", "pencere", "perde", "peynir", "pilav",
  "plan", "posta", "radyo", "renk", "resim", "rüya", "saat", "sabır",
  "salı", "sandalye", "sanat", "savaş", "sayı", "sebze", "sepet",
  "sevgi", "sıcak", "sınav", "sınıf", "simit", "sokak", "soru", "spor",
  "su", "süt", "şair", "şapka", "şarkı", "şehir", "şeker", "şemsiye",
  "şey", "şişe", "tahta", "takım", "tarak", "tarih", "tebeşir", "telefon",
  "televizyon", "temiz", "terazi", "top", "toprak", "torba", "tren",
  "turuncu", "uçak", "umut", "uyku", "uzak", "üzüm", "vakit", "vapur",
  "var", "vergi", "vicdan", "video", "yaprak", "yargı", "yarın", "yatak",
  "yaz", "yemek", "yengeç", "yer", "yıldız", "yol", "yorgan", "yudum",
  "yüz", "zaman", "zarf", "zeka", "zeytin", "zil", "zor",
] as const;

export const TURKCE_KELIME_SET = new Set<string>(TURKCE_KELIMELER);

export const BASLANGIC_KELIMELERI = TURKCE_KELIMELER.filter((word) => {
  const lastLetter = word.at(-1);
  return lastLetter !== "ğ" && lastLetter !== "j";
});