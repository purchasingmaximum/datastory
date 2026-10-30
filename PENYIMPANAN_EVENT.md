# Penyimpanan event baru (tanpa spreadsheet)

Input Report sekarang bekerja seperti Budget & Feasibility: laporan event
disimpan di **Firestore** (ruang bersama), bukan lagi ke Google Sheets lewat
Apps Script. Hasilnya:

| Fitur | Cara kerja |
|---|---|
| Daftar Event | Tombol **Buka · Edit · Duplikat · Hapus** per event (Hapus minta konfirmasi 2 klik). Duplikat langsung membuat salinan "(salinan)". |
| Buka | `input.html?view=<id>` — tampilan laporan (baca saja) + Excel, PDF, Edit, Duplikat, Hapus. |
| Edit | `input.html?edit=<id>` — form yang sama; setelah Update langsung ke tampilan Buka. |
| Export Excel | Sheet **Laporan Event** (urutan & kolom sama dengan isian; Total/Sisa berisi rumus) + sheet **Analisis**. Tersedia di pratinjau sebelum submit dan di tampilan Buka. |
| Export PDF | Tombol **PDF** memakai dialog cetak browser (Save as PDF), hanya area laporan. |
| Analisis | Dihitung langsung dari semua event tersimpan: kategori & vendor terbesar, posisi total biaya vs event lain (Q1/median/Q3), harga per barang vs median event lain (per hari), sisa pembayaran. Tampil di pratinjau, di Buka, dan di sheet Analisis Excel. |
| Analytics | Membaca store yang sama dan **ter-update langsung** (tanpa muat ulang) saat ada event disimpan/diedit/dihapus. |

## File
- `js/event-store.js` — penyimpanan Firestore + cadangan localStorage + antrean offline. Menimpa `loadAllEvents`, `loadEventsList`, `loadEventById`, `loadStats`, `loadDictionaries`, `submitEvent` dari `data.js`.
- `js/event-analysis.js` — analisis satu event vs semua event.
- `js/event-export.js` — pembuat file Excel (ExcelJS) & cetak PDF.
- Dihapus: `js/firebase-data.js`, `js/outbox.js` (tidak dipakai lagi).

## Yang perlu dicek sekali
1. **Aturan Firestore.** Data ditulis ke `ruang/eTnJNyzUEMfL4q4xDMM5JusiO7_laporan/projects/{eventId}` —
   collection `projects` yang sama dengan Budget/Feasibility, tapi ruang (workspace) terpisah.
   Bila aturan Anda hanya mengizinkan nama ruang tertentu, tambahkan ruang ini, atau ubah konstanta
   `WORKSPACE` di `js/event-store.js` ke ruang yang sudah diizinkan.
2. **Anonymous Auth** harus aktif di proyek `feasibilitymxm` (sudah dipakai Budget/Feasibility).
3. **Impor data lama:** buka Daftar Event → **Impor data dari spreadsheet lama**. Event di Google Sheets
   disalin ke Firestore (ID & tanggal asli dipertahankan; yang sudah ada tidak ditimpa). Setelah itu
   Apps Script (`Code.gs`) dan workflow `keep-warm.yml` tidak diperlukan lagi untuk Input/Analytics.

## Perilaku offline
Perubahan selalu disimpan di perangkat lebih dulu; bila cloud belum tersambung, perubahan ditandai
"menunggu sambungan" dan dikirim otomatis begitu tersambung. Event yang dihapus dari perangkat lain
ikut hilang dari salinan lokal setelah data server terkonfirmasi.

## Catatan
- ID event tetap berpola `MM-ke-NN-ke-YYYY` (nomor urut per bulan event).
- Halaman Database (harga vendor) tetap membaca Google Sheets harga — tidak diubah.
- Dua pengguna yang menyimpan event **baru** di bulan yang sama pada detik yang sama bisa mendapat ID sama
  (kemungkinan kecil); event kedua menimpa yang pertama. Bila ini jadi masalah, ID dapat diganti
  ke acak/UUID di `makeEventId()`.
