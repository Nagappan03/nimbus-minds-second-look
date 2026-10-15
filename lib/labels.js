// Fixed UI text for the verdict card in the four supported languages.
// The explanation, reasons and next steps come from Gemini in the same language.

export const LABELS = {
  en: {
    PROCEED: "Looks fine to send",
    BE_CAREFUL: "Be careful",
    HOLD: "Hold: please do not send yet",
    risk: "Risk",
    why: "Why",
    next: "What to do next",
    conversation: "From the chat",
    payee: "Payee record",
    unverified: "(wording not found exactly in the chat)",
    truncated: "The conversation was long, so only the first 6,000 characters were checked.",
    footnote: "Second Look gives advice only. If a payment is held, a member of bank staff reviews it before anything is blocked.",
    checkedIn: (s) => `Checked in ${s} s.`,
    savedExample: "This is a saved example, not a live check of your conversation.",
    savedResult: "Saved example result.",
    tryAgain: "Try again",
  },
  hi: {
    PROCEED: "भेजना ठीक लगता है",
    BE_CAREFUL: "सावधान रहें",
    HOLD: "रुकें: अभी पैसे न भेजें",
    risk: "जोखिम",
    why: "क्यों",
    next: "आगे क्या करें",
    conversation: "चैट से",
    payee: "प्राप्तकर्ता का रिकॉर्ड",
    unverified: "(ये शब्द चैट में हूबहू नहीं मिले)",
    truncated: "बातचीत लंबी थी, इसलिए केवल पहले 6,000 अक्षरों की जाँच की गई।",
    footnote: "Second Look केवल सलाह देता है। अगर कोई भुगतान रोका जाता है, तो कुछ भी ब्लॉक करने से पहले बैंक का एक कर्मचारी उसकी समीक्षा करता है।",
    checkedIn: (s) => `${s} सेकंड में जाँचा गया।`,
    savedExample: "यह एक सहेजा गया उदाहरण है, आपकी बातचीत की लाइव जाँच नहीं।",
    savedResult: "सहेजा गया उदाहरण परिणाम।",
    tryAgain: "फिर से कोशिश करें",
  },
  ta: {
    PROCEED: "அனுப்பலாம் எனத் தெரிகிறது",
    BE_CAREFUL: "கவனமாக இருங்கள்",
    HOLD: "நிறுத்துங்கள்: இப்போது பணம் அனுப்ப வேண்டாம்",
    risk: "ஆபத்து",
    why: "ஏன்",
    next: "அடுத்து என்ன செய்வது",
    conversation: "உரையாடலில் இருந்து",
    payee: "பெறுநர் பதிவு",
    unverified: "(இந்த வார்த்தைகள் உரையாடலில் அப்படியே இல்லை)",
    truncated: "உரையாடல் நீளமாக இருந்ததால், முதல் 6,000 எழுத்துகள் மட்டுமே சரிபார்க்கப்பட்டன.",
    footnote: "Second Look ஆலோசனை மட்டுமே வழங்குகிறது. ஒரு பணம் நிறுத்தப்பட்டால், எதையும் தடுப்பதற்கு முன் வங்கி ஊழியர் ஒருவர் அதைச் சரிபார்ப்பார்.",
    checkedIn: (s) => `${s} வினாடிகளில் சரிபார்க்கப்பட்டது.`,
    savedExample: "இது சேமிக்கப்பட்ட ஒரு எடுத்துக்காட்டு, உங்கள் உரையாடலின் நேரடி சரிபார்ப்பு அல்ல.",
    savedResult: "சேமிக்கப்பட்ட எடுத்துக்காட்டு முடிவு.",
    tryAgain: "மீண்டும் முயலவும்",
  },
  id: {
    PROCEED: "Tampaknya aman untuk dikirim",
    BE_CAREFUL: "Berhati-hatilah",
    HOLD: "Tahan: jangan kirim dulu",
    risk: "Risiko",
    why: "Alasannya",
    next: "Langkah selanjutnya",
    conversation: "Dari percakapan",
    payee: "Catatan penerima",
    unverified: "(kata-kata ini tidak ditemukan persis di percakapan)",
    truncated: "Percakapannya panjang, jadi hanya 6.000 karakter pertama yang diperiksa.",
    footnote: "Second Look hanya memberi saran. Jika pembayaran ditahan, petugas bank akan meninjaunya sebelum ada yang diblokir.",
    checkedIn: (s) => `Diperiksa dalam ${s} detik.`,
    savedExample: "Ini contoh yang tersimpan, bukan pemeriksaan langsung atas percakapan Anda.",
    savedResult: "Hasil contoh tersimpan.",
    tryAgain: "Coba lagi",
  },
};

export const labelsFor = (language) => LABELS[language] || LABELS.en;

// Ops console (English only: bank staff UI).
export const LANGUAGE_NAMES = { en: "English", hi: "Hindi", ta: "Tamil", id: "Bahasa Indonesia" };

export const STATUS_LABELS = {
  pending_review: "Needs review",
  no_action: "No action",
  hold_confirmed: "Hold confirmed",
  released: "Released",
};

export const VERDICT_LABELS = { PROCEED: "Proceed", BE_CAREFUL: "Be careful", HOLD: "Hold" };
