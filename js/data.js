/* =========================================================================
   data.js
   Data layer shared by input.js and analytics.js.

   Responsibilities:
   - CONFIG: where the app gets its data from (Google Apps Script Web App,
     or local demo mode using bundled sample data + localStorage).
   - Normalization helpers (vendor names, numbers, currency parsing).
   - Statistical aggregation functions used across the analytics sections.

   Nothing in this file mutates SAMPLE_EVENTS. Locally-submitted reports are
   kept separately in localStorage so the bundled sample dataset always
   stays intact.
   ========================================================================= */

const CONFIG = {
  // Paste your deployed Google Apps Script Web App URL here to run against
  // a real backend, e.g. "https://script.google.com/macros/s/AKfycb.../exec".
  // Leave empty to run fully client-side against the bundled sample data +
  // localStorage, which is the default "run locally" mode described in
  // README.md.
  API_URL: "https://script.google.com/macros/s/AKfycbxJQCf8X5nIkeQ1iLN0dd3cweyWUcgkrA8H6b2CvVBHzHL91ZSS-Fry6TG6HsCSek8G/exec",
  LOCAL_STORAGE_KEY: "eo_datastory_submissions_v1",
};

/* -------------------------------------------------------------------------
   Item & vendor dictionaries — power the searchable dropdowns in the input
   form (js/combobox.js + js/input.js).

   - ITEM_DICTIONARY_BUNDLED / VENDOR_DICTIONARY_BUNDLED below are generated
     from Item_Dictionary.xlsx / Vendor_Dictionary.xlsx and used whenever
     CONFIG.API_URL is empty (local/demo mode), so the dropdowns work
     out of the box with no backend.
   - When CONFIG.API_URL is set, loadDictionaries() instead fetches the live
     ITEM_DICTIONARY / VENDOR_DICTIONARY sheets from the Apps Script backend
     (see Code.gs, action=getDictionaries), so edits to those sheets show up
     without redeploying the site.
   ------------------------------------------------------------------------- */

const ITEM_DICTIONARY_BUNDLED = [
  { itemId: "LED-001", kategori: "LED", namaItemStandar: "Analogway Alta 4K", satuanStandar: "item" },
  { itemId: "LED-002", kategori: "LED", namaItemStandar: "Analogway Eikos 4K", satuanStandar: "item" },
  { itemId: "LED-003", kategori: "LED", namaItemStandar: "System EC 90", satuanStandar: "item" },
  { itemId: "LED-004", kategori: "LED", namaItemStandar: "LED Cube 32 x 32", satuanStandar: "item" },
  { itemId: "LED-005", kategori: "LED", namaItemStandar: "LED Cube 50 x 50", satuanStandar: "item" },
  { itemId: "LED-006", kategori: "LED", namaItemStandar: "LED P2.6 Indoor", satuanStandar: "sqm" },
  { itemId: "LED-007", kategori: "LED", namaItemStandar: "LED P2.6 Indoor Special Shape Flexible, Siku", satuanStandar: "package" },
  { itemId: "LED-008", kategori: "LED", namaItemStandar: "LED P2.9 Indoor", satuanStandar: "sqm" },
  { itemId: "LED-009", kategori: "LED", namaItemStandar: "LED P3.9 Floor", satuanStandar: "sqm" },
  { itemId: "LED-010", kategori: "LED", namaItemStandar: "LED P3.9 Indoor", satuanStandar: "sqm" },
  { itemId: "LED-011", kategori: "LED", namaItemStandar: "LED P3.9 Outdoor", satuanStandar: "package" },
  { itemId: "LED-012", kategori: "LED", namaItemStandar: "LED P3.9 Transparan", satuanStandar: "sqm" },
  { itemId: "LED-013", kategori: "LED", namaItemStandar: "Media Server", satuanStandar: "item" },
  { itemId: "LED-014", kategori: "LED", namaItemStandar: "Optik", satuanStandar: "item" },
  { itemId: "LED-015", kategori: "LED", namaItemStandar: "Pixel Hue Go4K", satuanStandar: "item" },
  { itemId: "LED-016", kategori: "LED", namaItemStandar: "Rell", satuanStandar: "item" },
  { itemId: "LED-017", kategori: "LED", namaItemStandar: "Resolume & VJ", satuanStandar: "package" },
  { itemId: "LED-023", kategori: "LED", namaItemStandar: "System S3", satuanStandar: "package" },
  { itemId: "LGT-001", kategori: "Lighting", namaItemStandar: "Arena", satuanStandar: "item" },
  { itemId: "LGT-002", kategori: "Lighting", namaItemStandar: "Beam BSW 350 Watt", satuanStandar: "unit" },
  { itemId: "LGT-003", kategori: "Lighting", namaItemStandar: "Beam Spot 380", satuanStandar: "item" },
  { itemId: "LGT-004", kategori: "Lighting", namaItemStandar: "Bee Eye K15 19 x 40 Watt", satuanStandar: "item" },
  { itemId: "LGT-005", kategori: "Lighting", namaItemStandar: "Bee Eye K10", satuanStandar: "item" },
  { itemId: "LGT-006", kategori: "Lighting", namaItemStandar: "Bee Eye K15", satuanStandar: "item" },
  { itemId: "LGT-007", kategori: "Lighting", namaItemStandar: "Brut Blinder 2 Cell COB LED", satuanStandar: "item" },
  { itemId: "LGT-008", kategori: "Lighting", namaItemStandar: "Brut Blinder 4 Cell COB LED", satuanStandar: "item" },
  { itemId: "LGT-009", kategori: "Lighting", namaItemStandar: "Follow Spot LED", satuanStandar: "item" },
  { itemId: "LGT-010", kategori: "Lighting", namaItemStandar: "Fresnell 400 Watt", satuanStandar: "item" },
  { itemId: "LGT-011", kategori: "Lighting", namaItemStandar: "Fresnell 300 Watt", satuanStandar: "item" },
  { itemId: "LGT-012", kategori: "Lighting", namaItemStandar: "Fresnell 200 Watt", satuanStandar: "item" },
  { itemId: "LGT-013", kategori: "Lighting", namaItemStandar: "Fresnell LED 300w Zoom", satuanStandar: "item" },
  { itemId: "LGT-014", kategori: "Lighting", namaItemStandar: "Fresnell LED 200w COB", satuanStandar: "item" },
  { itemId: "LGT-015", kategori: "Lighting", namaItemStandar: "Grand MA Fullsize Copy", satuanStandar: "item" },
  { itemId: "LGT-016", kategori: "Lighting", namaItemStandar: "Grand MA Fullsize Ori", satuanStandar: "item" },
  { itemId: "LGT-017", kategori: "Lighting", namaItemStandar: "Halogen 1000 Watt", satuanStandar: "item" },
  { itemId: "LGT-018", kategori: "Lighting", namaItemStandar: "Halogen 1500 Watt", satuanStandar: "item" },
  { itemId: "LGT-019", kategori: "Lighting", namaItemStandar: "Halogen LED", satuanStandar: "item" },
  { itemId: "LGT-020", kategori: "Lighting", namaItemStandar: "Hazer", satuanStandar: "item" },
  { itemId: "LGT-021", kategori: "Lighting", namaItemStandar: "HPIT 200 Watt", satuanStandar: "item" },
  { itemId: "LGT-022", kategori: "Lighting", namaItemStandar: "Lecko 16/36 Degree", satuanStandar: "item" },
  { itemId: "LGT-023", kategori: "Lighting", namaItemStandar: "Lighting Design", satuanStandar: "item" },
  { itemId: "LGT-024", kategori: "Lighting", namaItemStandar: "Madrix System", satuanStandar: "item" },
  { itemId: "LGT-025", kategori: "Lighting", namaItemStandar: "Mirrorball", satuanStandar: "item" },
  { itemId: "LGT-026", kategori: "Lighting", namaItemStandar: "Moving Beam Dage BSW AK 580", satuanStandar: "item" },
  { itemId: "LGT-027", kategori: "Lighting", namaItemStandar: "Moving Beam Dage BSW SK 680", satuanStandar: "item" },
  { itemId: "LGT-028", kategori: "Lighting", namaItemStandar: "Moving Beam A8", satuanStandar: "item" },
  { itemId: "LGT-029", kategori: "Lighting", namaItemStandar: "Moving Wash 6 in 1", satuanStandar: "item" },
  { itemId: "LGT-030", kategori: "Lighting", namaItemStandar: "Par Can 53", satuanStandar: "item" },
  { itemId: "LGT-031", kategori: "Lighting", namaItemStandar: "Par Can 64", satuanStandar: "item" },
  { itemId: "LGT-032", kategori: "Lighting", namaItemStandar: "Par LED 120 Watt", satuanStandar: "item" },
  { itemId: "LGT-033", kategori: "Lighting", namaItemStandar: "Par LED Dage 24x10w RGBW", satuanStandar: "item" },
  { itemId: "LGT-034", kategori: "Lighting", namaItemStandar: "Sky Track Beam 440", satuanStandar: "item" },
  { itemId: "LGT-035", kategori: "Lighting", namaItemStandar: "Smoke", satuanStandar: "item" },
  { itemId: "LGT-036", kategori: "Lighting", namaItemStandar: "Spider Beam 8 Cell", satuanStandar: "item" },
  { itemId: "LGT-037", kategori: "Lighting", namaItemStandar: "Strobo LED", satuanStandar: "item" },
  { itemId: "LGT-038", kategori: "Lighting", namaItemStandar: "Super White / Power Par", satuanStandar: "item" },
  { itemId: "LGT-039", kategori: "Lighting", namaItemStandar: "Tiger Touch", satuanStandar: "item" },
  { itemId: "LGT-040", kategori: "Lighting", namaItemStandar: "Timecode System", satuanStandar: "item" },
  { itemId: "LGT-041", kategori: "Lighting", namaItemStandar: "Wall Washer 6 in 1", satuanStandar: "item" },
  { itemId: "LGT-042", kategori: "Lighting", namaItemStandar: "Wallwasher Dage 18x10w RGBW", satuanStandar: "item" },
  { itemId: "LGT-043", kategori: "Lighting", namaItemStandar: "Stromy", satuanStandar: "item" },
  { itemId: "LGT-044", kategori: "Lighting", namaItemStandar: "Elation Parled", satuanStandar: "item" },
  { itemId: "LGT-045", kategori: "Lighting", namaItemStandar: "Nebula Wireless Battery Tube", satuanStandar: "item" },
  { itemId: "LGT-046", kategori: "Lighting", namaItemStandar: "Moving Lightsky BWS 470W", satuanStandar: "item" },
  { itemId: "LGT-047", kategori: "Lighting", namaItemStandar: "Moving Lightsky Lunar Max 480W", satuanStandar: "item" },
  { itemId: "LGT-048", kategori: "Lighting", namaItemStandar: "Moving Aura BWS  400W", satuanStandar: "item" },
  { itemId: "LGT-049", kategori: "Lighting", namaItemStandar: "Moving Profile 1000W", satuanStandar: "item" },
  { itemId: "LGT-050", kategori: "Lighting", namaItemStandar: "Sunstrip RGB Waterproof", satuanStandar: "item" },
  { itemId: "LGT-051", kategori: "Lighting", namaItemStandar: "Impresion Bar", satuanStandar: "item" },
  { itemId: "LGT-052", kategori: "Lighting", namaItemStandar: "Par LED 54 Waterproof", satuanStandar: "item" },
  { itemId: "LGT-053", kategori: "Lighting", namaItemStandar: "Minibrute Waterproof", satuanStandar: "item" },
  { itemId: "LGT-054", kategori: "Lighting", namaItemStandar: "Magic Blade", satuanStandar: "item" },
  { itemId: "LGT-055", kategori: "Lighting", namaItemStandar: "Followspot 4000W", satuanStandar: "item" },
  { itemId: "LGT-056", kategori: "Lighting", namaItemStandar: "Tripod T", satuanStandar: "item" },
  { itemId: "LGT-057", kategori: "Lighting", namaItemStandar: "Avolite Tiger Touch", satuanStandar: "item" },
  { itemId: "LGT-058", kategori: "Lighting", namaItemStandar: "Avolite Quartz", satuanStandar: "item" },
  { itemId: "LGT-059", kategori: "Lighting", namaItemStandar: "Moving LED Wash Solaris", satuanStandar: "item" },
  { itemId: "LGT-060", kategori: "Lighting", namaItemStandar: "Martin Mac Viper XIP", satuanStandar: "item" },
  { itemId: "LGT-061", kategori: "Lighting", namaItemStandar: "Aura Wash XIP", satuanStandar: "item" },
  { itemId: "LGT-062", kategori: "Lighting", namaItemStandar: "Pixel Bar", satuanStandar: "item" },
  { itemId: "LGT-063", kategori: "Lighting", namaItemStandar: "Martin Mac Ultra (Moving Head)", satuanStandar: "item" },
  { itemId: "LGT-064", kategori: "Lighting", namaItemStandar: "Lighting ADVANCE 1", satuanStandar: "package" },
  { itemId: "LGT-065", kategori: "Lighting", namaItemStandar: "Lighting ADVANCE 2", satuanStandar: "package" },
  { itemId: "LGT-066", kategori: "Lighting", namaItemStandar: "Lighting BASIC 1", satuanStandar: "package" },
  { itemId: "LGT-067", kategori: "Lighting", namaItemStandar: "Lighting BASIC 2", satuanStandar: "package" },
  { itemId: "LGT-068", kategori: "Lighting", namaItemStandar: "Lighting BASIC 3", satuanStandar: "package" },
  { itemId: "LGT-069", kategori: "Lighting", namaItemStandar: "Lighting EXPERT", satuanStandar: "package" },
  { itemId: "LGT-070", kategori: "Lighting", namaItemStandar: "Avolite Pearl 2010", satuanStandar: "item" },
  { itemId: "AUD-001", kategori: "Audio", namaItemStandar: "Package Backline", satuanStandar: "package" },
  { itemId: "AUD-002", kategori: "Audio", namaItemStandar: "In Ear Monitor", satuanStandar: "item" },
  { itemId: "AUD-003", kategori: "Audio", namaItemStandar: "Sound Package A", satuanStandar: "package" },
  { itemId: "AUD-004", kategori: "Audio", namaItemStandar: "Sound Package B", satuanStandar: "package" },
  { itemId: "AUD-005", kategori: "Audio", namaItemStandar: "Sound Package C", satuanStandar: "package" },
  { itemId: "AUD-006", kategori: "Audio", namaItemStandar: "Sound Package D", satuanStandar: "package" },
  { itemId: "AUD-007", kategori: "Audio", namaItemStandar: "Sound Package E", satuanStandar: "package" },
  { itemId: "AUD-008", kategori: "Audio", namaItemStandar: "Sound Package F", satuanStandar: "package" },
  { itemId: "AUD-009", kategori: "Audio", namaItemStandar: "Sound Package 2.000 Watt", satuanStandar: "package" },
  { itemId: "AUD-010", kategori: "Audio", namaItemStandar: "Sound Package 3.000 Watt", satuanStandar: "package" },
  { itemId: "AUD-011", kategori: "Audio", namaItemStandar: "Sound Package 4.000 Watt", satuanStandar: "package" },
  { itemId: "AUD-012", kategori: "Audio", namaItemStandar: "Sound Package 5.000 Watt", satuanStandar: "package" },
  { itemId: "AUD-013", kategori: "Audio", namaItemStandar: "Sound Package 6.000 Watt", satuanStandar: "package" },
  { itemId: "AUD-014", kategori: "Audio", namaItemStandar: "Sound Package 7.000 Watt", satuanStandar: "package" },
  { itemId: "AUD-015", kategori: "Audio", namaItemStandar: "Sound Package 8.000 Watt", satuanStandar: "package" },
  { itemId: "AUD-016", kategori: "Audio", namaItemStandar: "Sound Package 9.000 Watt", satuanStandar: "package" },
  { itemId: "AUD-017", kategori: "Audio", namaItemStandar: "Sound Package 10.000 Watt", satuanStandar: "package" },
  { itemId: "AUD-018", kategori: "Audio", namaItemStandar: "Sound Package 11.000 Watt", satuanStandar: "package" },
  { itemId: "AUD-019", kategori: "Audio", namaItemStandar: "Sound Package 12.000 Watt", satuanStandar: "package" },
  { itemId: "AUD-020", kategori: "Audio", namaItemStandar: "Sound Package 13.000 Watt", satuanStandar: "package" },
  { itemId: "AUD-021", kategori: "Audio", namaItemStandar: "Sound Package 14.000 Watt", satuanStandar: "package" },
  { itemId: "AUD-022", kategori: "Audio", namaItemStandar: "Sound Package 15.000 Watt", satuanStandar: "package" },
  { itemId: "AUD-023", kategori: "Audio", namaItemStandar: "Sound Package 5000 - 7000 Watt", satuanStandar: "package" },
  { itemId: "AUD-024", kategori: "Audio", namaItemStandar: "Sound Package 10.000 - 12.000 Watt", satuanStandar: "package" },
  { itemId: "AUD-025", kategori: "Audio", namaItemStandar: "Sound Package 15.000 - 20.000 Watt", satuanStandar: "package" },
  { itemId: "AUD-026", kategori: "Audio", namaItemStandar: "Sound Package 30.000 - 45.000 Watt", satuanStandar: "package" },
  { itemId: "AUD-027", kategori: "Audio", namaItemStandar: "Sound Package 50.000 - 65.000 Watt", satuanStandar: "package" },
  { itemId: "AUD-028", kategori: "Audio", namaItemStandar: "Sound Package 80.000 - 100.000 Watt", satuanStandar: "package" },
  { itemId: "AUD-029", kategori: "Audio", namaItemStandar: "Sound Package 110.000 - 150.000 Watt", satuanStandar: "package" },
  { itemId: "AUD-030", kategori: "Audio", namaItemStandar: "Backline / Raiders", satuanStandar: "package" },
  { itemId: "AUD-031", kategori: "Audio", namaItemStandar: "Standard Band", satuanStandar: "package" },
  { itemId: "AUD-032", kategori: "Audio", namaItemStandar: "Big Band Format (Band with Brass Section)", satuanStandar: "package" },
  { itemId: "AUD-033", kategori: "Audio", namaItemStandar: "Band with Mini Orcestra", satuanStandar: "package" },
  { itemId: "AUD-034", kategori: "Audio", namaItemStandar: "Orchestra A 45 - 60 Pcs (Band with Orchestra)", satuanStandar: "package" },
  { itemId: "RIG-001", kategori: "Rigging", namaItemStandar: "Hoist PS 1000", satuanStandar: "Unit" },
  { itemId: "RIG-002", kategori: "Rigging", namaItemStandar: "Loading Day H-1", satuanStandar: "item" },
  { itemId: "RIG-003", kategori: "Rigging", namaItemStandar: "Loading Day H-2", satuanStandar: "Unit" },
  { itemId: "RIG-004", kategori: "Rigging", namaItemStandar: "Loading Day H-3", satuanStandar: "Unit" },
  { itemId: "RIG-005", kategori: "Rigging", namaItemStandar: "Extend Day H+1", satuanStandar: "Unit" },
  { itemId: "RIG-006", kategori: "Rigging", namaItemStandar: "Extend Day H+2", satuanStandar: "Unit" },
  { itemId: "RIG-007", kategori: "Rigging", namaItemStandar: "Extend Day H+3", satuanStandar: "Unit" },
  { itemId: "RIG-008", kategori: "Rigging", namaItemStandar: "Rigging Aluminium", satuanStandar: "item" },
  { itemId: "RIG-009", kategori: "Rigging", namaItemStandar: "Rigging Besi", satuanStandar: "item" },
  { itemId: "RIG-010", kategori: "Rigging", namaItemStandar: "Rigging H30 DM4", satuanStandar: "Unit" },
  { itemId: "RIG-011", kategori: "Rigging", namaItemStandar: "Rigging H30 DM6", satuanStandar: "Unit" },
  { itemId: "RIG-012", kategori: "Rigging", namaItemStandar: "Rigging H30 DM8", satuanStandar: "Unit" },
  { itemId: "RIG-013", kategori: "Rigging", namaItemStandar: "Rigging H30 Hitam", satuanStandar: "Meter" },
  { itemId: "RIG-014", kategori: "Rigging", namaItemStandar: "Rigging H30 Silver", satuanStandar: "Meter" },
  { itemId: "RIG-015", kategori: "Rigging", namaItemStandar: "Rigging H40 Hitam", satuanStandar: "Meter" },
  { itemId: "RIG-016", kategori: "Rigging", namaItemStandar: "Rigging H40 Silver", satuanStandar: "Meter" },
  { itemId: "RIG-018", kategori: "Rigging", namaItemStandar: "Rigging S52 Hitam", satuanStandar: "Meter" },
  { itemId: "RIG-019", kategori: "Rigging", namaItemStandar: "Rigging S52 Silver", satuanStandar: "Meter" },
  { itemId: "RIG-020", kategori: "Rigging", namaItemStandar: "Stagedex", satuanStandar: "Unit" },
  { itemId: "RIG-021", kategori: "Rigging", namaItemStandar: "Tackel", satuanStandar: "Unit" },
  { itemId: "RIG-022", kategori: "Rigging", namaItemStandar: "Tambahan Biaya Cover Kain Baru", satuanStandar: "Meter" },
  { itemId: "RIG-023", kategori: "Rigging", namaItemStandar: "Tambahan Biaya Pengecatan Baru", satuanStandar: "Meter" },
  { itemId: "RIG-024", kategori: "Rigging", namaItemStandar: "Ringlock Modul 2x2", satuanStandar: "Unit" },
  { itemId: "RIG-025", kategori: "Rigging", namaItemStandar: "Ringlock Modul 1x1", satuanStandar: "Unit" },
  { itemId: "MMD-001", kategori: "Multimedia", namaItemStandar: "MULTICAM 1 - Long Time", satuanStandar: "jam" },
  { itemId: "MMD-002", kategori: "Multimedia", namaItemStandar: "MULTICAM 1 - Short Time", satuanStandar: "jam" },
  { itemId: "MMD-003", kategori: "Multimedia", namaItemStandar: "MULTICAM 2 - Long Time", satuanStandar: "jam" },
  { itemId: "MMD-004", kategori: "Multimedia", namaItemStandar: "MULTICAM 2 - Short Time", satuanStandar: "jam" },
  { itemId: "MMD-005", kategori: "Multimedia", namaItemStandar: "MULTICAM 3 - Long Time", satuanStandar: "jam" },
  { itemId: "MMD-006", kategori: "Multimedia", namaItemStandar: "MULTICAM 3 - Short Time", satuanStandar: "jam" },
  { itemId: "MMD-007", kategori: "Multimedia", namaItemStandar: "Projector 10.000 ansi", satuanStandar: "item" },
  { itemId: "MMD-008", kategori: "Multimedia", namaItemStandar: "Projector 10.000 ansi + Screen 2x3", satuanStandar: "item" },
  { itemId: "MMD-009", kategori: "Multimedia", namaItemStandar: "Projector 10.000 ansi + Screen 3x4", satuanStandar: "item" },
  { itemId: "MMD-010", kategori: "Multimedia", namaItemStandar: "Projector 10.000 ansi + Screen 4x6", satuanStandar: "item" },
  { itemId: "MMD-011", kategori: "Multimedia", namaItemStandar: "Projector 5000 ansi + Screen 2x3", satuanStandar: "item" },
  { itemId: "MMD-012", kategori: "Multimedia", namaItemStandar: "• Projector 5000 ansi\n• Screen 3x4", satuanStandar: "item" },
  { itemId: "MMD-013", kategori: "Multimedia", namaItemStandar: "Projector 5500 ansi", satuanStandar: "item" },
  { itemId: "MMD-014", kategori: "Multimedia", namaItemStandar: "• Projector 6000 ansi\n• Screen 2x3", satuanStandar: "item" },
  { itemId: "MMD-015", kategori: "Multimedia", namaItemStandar: "• Projector 6000 ansi\n• Screen 3x4", satuanStandar: "item" },
  { itemId: "MMD-016", kategori: "Multimedia", namaItemStandar: "Projector 7000 ansi", satuanStandar: "item" },
  { itemId: "MMD-017", kategori: "Multimedia", namaItemStandar: "Screen 2x3", satuanStandar: "item" },
  { itemId: "MMD-018", kategori: "Multimedia", namaItemStandar: "Screen 3x4", satuanStandar: "item" },
  { itemId: "MMD-019", kategori: "Multimedia", namaItemStandar: "Screen 4x6", satuanStandar: "item" },
  { itemId: "MMD-020", kategori: "Multimedia", namaItemStandar: "TV LED 42\"", satuanStandar: "item" },
  { itemId: "MMD-021", kategori: "Multimedia", namaItemStandar: "TV LED 50\"", satuanStandar: "item" },
  { itemId: "MMD-022", kategori: "Multimedia", namaItemStandar: "TV LED 60\"", satuanStandar: "item" },
  { itemId: "MMD-023", kategori: "Multimedia", namaItemStandar: "TV LED 85\"", satuanStandar: "item" },
  { itemId: "EFF-001", kategori: "Effect", namaItemStandar: "Bubble Machine", satuanStandar: "item" },
  { itemId: "EFF-002", kategori: "Effect", namaItemStandar: "CO Liquid", satuanStandar: "item" },
  { itemId: "EFF-003", kategori: "Effect", namaItemStandar: "CO2 Gun", satuanStandar: "item" },
  { itemId: "EFF-004", kategori: "Effect", namaItemStandar: "CO2 Jet", satuanStandar: "item" },
  { itemId: "EFF-005", kategori: "Effect", namaItemStandar: "Confetti Blower", satuanStandar: "item" },
  { itemId: "EFF-006", kategori: "Effect", namaItemStandar: "Confetti Cannon", satuanStandar: "item" },
  { itemId: "EFF-007", kategori: "Effect", namaItemStandar: "Confetti Sprinkler", satuanStandar: "item" },
  { itemId: "EFF-008", kategori: "Effect", namaItemStandar: "Dry Ice Liquid", satuanStandar: "item" },
  { itemId: "EFF-009", kategori: "Effect", namaItemStandar: "Dry Ice Machine", satuanStandar: "item" },
  { itemId: "EFF-010", kategori: "Effect", namaItemStandar: "Giant Confetti", satuanStandar: "item" },
  { itemId: "EFF-011", kategori: "Effect", namaItemStandar: "Hazzer Machine", satuanStandar: "item" },
  { itemId: "EFF-012", kategori: "Effect", namaItemStandar: "Laser 15 Watt", satuanStandar: "item" },
  { itemId: "EFF-013", kategori: "Effect", namaItemStandar: "Laser 2 Watt", satuanStandar: "item" },
  { itemId: "EFF-014", kategori: "Effect", namaItemStandar: "Laser 4 Watt", satuanStandar: "item" },
  { itemId: "EFF-015", kategori: "Effect", namaItemStandar: "Laser 8 Watt", satuanStandar: "item" },
  { itemId: "EFF-016", kategori: "Effect", namaItemStandar: "Napalm", satuanStandar: "item" },
  { itemId: "EFF-017", kategori: "Effect", namaItemStandar: "Pyro", satuanStandar: "item" },
  { itemId: "EFF-018", kategori: "Effect", namaItemStandar: "Silverjet", satuanStandar: "item" },
  { itemId: "EFF-019", kategori: "Effect", namaItemStandar: "Smoke Machine", satuanStandar: "item" },
  { itemId: "EFF-020", kategori: "Effect", namaItemStandar: "Sparkular (Cold Pyro)", satuanStandar: "item" },
  { itemId: "DOC-001", kategori: "Documentation", namaItemStandar: "Highlight Clip", satuanStandar: "output" },
  { itemId: "DOC-002", kategori: "Documentation", namaItemStandar: "Photographer", satuanStandar: "person" },
  { itemId: "DOC-003", kategori: "Documentation", namaItemStandar: "Package Documentation", satuanStandar: "package" },
  { itemId: "GEN-001", kategori: "Genset", namaItemStandar: "Charge Kabel", satuanStandar: "item" },
  { itemId: "GEN-002", kategori: "Genset", namaItemStandar: "Genset 100 KVA", satuanStandar: "item" },
  { itemId: "GEN-003", kategori: "Genset", namaItemStandar: "Genset 150 KVA", satuanStandar: "item" },
  { itemId: "GEN-004", kategori: "Genset", namaItemStandar: "Genset 40 KVA", satuanStandar: "item" },
  { itemId: "GEN-005", kategori: "Genset", namaItemStandar: "Genset 50 KVA", satuanStandar: "item" },
  { itemId: "GEN-006", kategori: "Genset", namaItemStandar: "Genset 60 KVA", satuanStandar: "item" },
  { itemId: "GEN-007", kategori: "Genset", namaItemStandar: "Genset 80 KVA", satuanStandar: "item" },
  { itemId: "GEN-008", kategori: "Genset", namaItemStandar: "Genset 200 KVA", satuanStandar: "item" },
  { itemId: "GEN-009", kategori: "Genset", namaItemStandar: "Genset 250 KVA", satuanStandar: "item" },
  { itemId: "GEN-010", kategori: "Genset", namaItemStandar: "Overtime Genset", satuanStandar: "service" },
  { itemId: "NET-001", kategori: "Internet", namaItemStandar: "Internet", satuanStandar: "package" },
  { itemId: "NET-002", kategori: "Internet", namaItemStandar: "Internet", satuanStandar: "package" },
];

const VENDOR_DICTIONARY_BUNDLED = [
  { vendorId: "VND-001", namaVendor: "AV MASTER MEDIA INDONESIA", kategoriLayanan: "" },
  { vendorId: "VND-002", namaVendor: "BANI", kategoriLayanan: "" },
  { vendorId: "VND-003", namaVendor: "BIZNET", kategoriLayanan: "" },
  { vendorId: "VND-004", namaVendor: "BLIGHT", kategoriLayanan: "" },
  { vendorId: "VND-005", namaVendor: "CV NIKI LEDINDO SEMPURNA", kategoriLayanan: "" },
  { vendorId: "VND-006", namaVendor: "NEXTPRO", kategoriLayanan: "" },
  { vendorId: "VND-007", namaVendor: "PAPERMOTION", kategoriLayanan: "" },
  { vendorId: "VND-008", namaVendor: "PE PLUS", kategoriLayanan: "" },
  { vendorId: "VND-009", namaVendor: "PT ARTHUR TEKNIK INDOPRIMA", kategoriLayanan: "" },
  { vendorId: "VND-010", namaVendor: "PT SIMA AGUSTUS", kategoriLayanan: "" },
  { vendorId: "VND-011", namaVendor: "PT. BUDI BONZAI NUSANTARA", kategoriLayanan: "" },
  { vendorId: "VND-012", namaVendor: "RR", kategoriLayanan: "" },
  { vendorId: "VND-013", namaVendor: "THUNDER PRODUCTION INDONESIA", kategoriLayanan: "" },
  { vendorId: "VND-014", namaVendor: "TONES PRO", kategoriLayanan: "" },
  { vendorId: "VND-015", namaVendor: "V2 INDONESIA", kategoriLayanan: "" },
];


/* -------------------------------------------------------------------------
   Sample dataset (used whenever CONFIG.API_URL is empty). Independent of
   whatever the user has submitted locally, so the analytics page always has
   something meaningful to show on first run.
   ------------------------------------------------------------------------- */
const SAMPLE_EVENTS = [
  mk("Nadia", "Wedding Reception - Aditya & Rani", "PT Anugerah Selaras", "2026-01-11", 1, 0, "Bandung", "Indonesia", [
    it("LED-01", "LED Panel P3", "LED", "Vendor A", 40, 32000000),
    it("SND-04", "Line Array Speaker", "Audio", "Vendor C", 8, 18500000),
    it("GEN-02", "Genset 50kVA", "Genset", "Vendor B", 1, 4200000),
  ]),
  mk("Nadia", "Corporate Townhall Q1", "Bank Kartika", "2026-01-18", 1, 1, "Jakarta", "Indonesia", [
    it("LED-02", "LED Panel P4", "LED", "Vendor A", 24, 15000000),
    it("MIC-01", "Mic Wireless Handheld", "Audio", "Vendor D", 6, 3600000),
    it("LGT-03", "Moving Head Beam", "Lighting", "Vendor B", 12, 9600000),
  ]),
  mk("Rizky", "Product Launch - Skinlab", "Skinlab Cosmetics", "2026-02-02", 2, 1, "Jakarta", "Indonesia", [
    it("LED-01", "LED Panel P3", "LED", "Vendor A", 60, 48000000),
    it("LGT-03", "Moving Head Beam", "Lighting", "Vendor B", 20, 16000000),
    it("SND-04", "Line Array Speaker", "Audio", "Vendor C", 12, 27750000),
    it("RIG-01", "Truss Support 3m", "Rigging", "Vendor E", 16, 6400000),
  ]),
  mk("Rizky", "Wedding Reception - Bagus & Sinta", "Keluarga Bagus", "2026-02-14", 1, 0, "Bandung", "Indonesia", [
    it("LED-01", "LED Panel P3", "LED", "Vendor A", 32, 25600000),
    it("SND-02", "Speaker Portable Set", "Audio", "Vendor C", 4, 6000000),
  ]),
  mk("Vina", "Music Festival Day 1", "Kolektif Bunyi", "2026-02-21", 1, 2, "Bandung", "Indonesia", [
    it("LED-02", "LED Panel P4", "LED", "Vendor A", 80, 50000000),
    it("LGT-01", "Moving Head Spot", "Lighting", "Vendor B", 30, 27000000),
    it("SND-04", "Line Array Speaker", "Audio", "Vendor C", 24, 55500000),
    it("GEN-01", "Genset 100kVA", "Genset", "Vendor B", 2, 12000000),
    it("RIG-02", "Truss Support 6m", "Rigging", "Vendor E", 20, 12000000),
  ]),
  mk("Nadia", "Annual Gala Dinner", "PT Sumber Makmur", "2026-03-06", 1, 1, "Jakarta", "Indonesia", [
    it("LED-01", "LED Panel P3", "LED", "vendor a", 48, 38400000),
    it("MIC-01", "Mic Wireless Handheld", "Audio", "Vendor D", 8, 4800000),
    it("DOC-01", "Videography Crew", "Documentation", "Vendor F", 1, 8000000),
  ]),
  mk("Rizky", "Church Youth Retreat", "GKI Youth", "2026-03-13", 1, 1, "Lembang", "Indonesia", [
    it("SND-02", "Speaker Portable Set", "Audio", "Vendor C", 2, 3000000),
    it("MIC-01", "Mic Wireless Handheld", "Audio", "Vendor D", 3, 1800000),
    it("LGT-04", "Par Led Stage Light", "Lighting", "Vendor B", 12, 3600000),
  ]),
  mk("Vina", "Wedding Reception - Farhan & Dinda", "Keluarga Farhan", "2026-03-21", 1, 0, "Surabaya", "Indonesia", [
    it("LED-01", "LED Panel P3", "LED", "Vendor A", 36, 28800000),
    it("SND-04", "Line Array Speaker", "Audio", "Vendor C", 8, 18500000),
    it("GEN-02", "Genset 50kVA", "Genset", "Vendor B", 1, 4200000),
  ]),
  mk("Nadia", "Product Launch - Aetherwear", "Aetherwear Studio", "2026-04-04", 1, 1, "Jakarta", "Indonesia", [
    it("LGT-01", "Moving Head Spot", "Lighting", "Vendor B", 16, 14400000),
    it("SND-02", "Speaker Portable Set", "Audio", "Vendor C", 6, 9000000),
    it("DOC-02", "Photography Crew", "Documentation", "Vendor F", 2, 6000000),
    it("MUL-01", "LED Video Wall Content", "Multimedia", "Vendor G", 1, 11000000),
  ]),
  mk("Rizky", "Wedding Reception - Galih & Wulan", "Keluarga Galih", "2026-04-12", 1, 0, "Bandung", "Indonesia", [
    it("LED-01", "LED Panel P3", "LED", "Vendor A", 32, 25600000),
    it("SND-04", "Line Array Speaker", "Audio", "Vendor C", 8, 18500000),
  ]),
  mk("Vina", "Corporate Family Day", "PT Jaya Abadi", "2026-04-25", 1, 0, "Bandung", "Indonesia", [
    it("SND-02", "Speaker Portable Set", "Audio", "Vendor C", 4, 6000000),
    it("MIC-01", "Mic Wireless Handheld", "Audio", "Vendor D", 4, 2400000),
    it("GEN-02", "Genset 50kVA", "Genset", "Vendor B", 1, 4200000),
  ]),
  mk("Nadia", "Music Festival Day 2", "Kolektif Bunyi", "2026-05-02", 1, 2, "Bandung", "Indonesia", [
    it("LED-02", "LED Panel P4", "LED", "Vendor A", 70, 43750000),
    it("LGT-01", "Moving Head Spot", "Lighting", "Vendor B", 24, 21600000),
    it("SND-04", "Line Array Speaker", "Audio", "Vendor C", 20, 46250000),
    it("RIG-02", "Truss Support 6m", "Rigging", "Vendor E", 16, 9600000),
  ]),
  mk("Rizky", "Wedding Reception - Hasan & Nadira", "Keluarga Hasan", "2026-05-09", 1, 0, "Jakarta", "Indonesia", [
    it("LED-01", "LED Panel P3", "LED", "Vendor A", 40, 32000000),
    it("LGT-04", "Par Led Stage Light", "Lighting", "Vendor B", 16, 4800000),
    it("SND-02", "Speaker Portable Set", "Audio", "Vendor C", 4, 6000000),
  ]),
  mk("Vina", "Ministry Leaders Gathering", "GARA Community", "2026-05-16", 1, 1, "Bandung", "Indonesia", [
    it("SND-02", "Speaker Portable Set", "Audio", "Vendor C", 3, 4500000),
    it("MIC-01", "Mic Wireless Handheld", "Audio", "Vendor D", 4, 2400000),
    it("DOC-02", "Photography Crew", "Documentation", "Vendor F", 1, 3000000),
  ]),
  mk("Nadia", "Product Launch - Rasa Nusantara", "Rasa Nusantara F&B", "2026-06-06", 1, 0, "Jakarta", "Indonesia", [
    it("LED-01", "LED Panel P3", "LED", "Vendor A", 28, 22400000),
    it("SND-02", "Speaker Portable Set", "Audio", "Vendor C", 4, 6000000),
    it("DOC-01", "Videography Crew", "Documentation", "Vendor F", 1, 8000000),
  ]),
  mk("Rizky", "Wedding Reception - Irfan & Kayla", "Keluarga Irfan", "2026-06-20", 1, 0, "Bandung", "Indonesia", [
    it("LED-01", "LED Panel P3", "LED", "Vendor A", 36, 28800000),
    it("SND-04", "Line Array Speaker", "Audio", "Vendor C", 8, 18500000),
    it("GEN-02", "Genset 50kVA", "Genset", "Vendor B", 1, 4200000),
  ]),
  mk("Vina", "Corporate Annual Meeting", "PT Sumber Makmur", "2026-07-11", 1, 0, "Jakarta", "Indonesia", [
    it("LED-02", "LED Panel P4", "LED", "Vendor A", 20, 12500000),
    it("MIC-01", "Mic Wireless Handheld", "Audio", "Vendor D", 6, 3600000),
  ]),
  mk("Nadia", "Wedding Reception - Joko & Larasati", "Keluarga Joko", "2026-08-08", 1, 0, "Surabaya", "Indonesia", [
    it("LED-01", "LED Panel P3", "LED", "Vendor A", 32, 25600000),
    it("SND-04", "Line Array Speaker", "Audio", "Vendor C", 8, 18500000),
    it("GEN-02", "Genset 50kVA", "Genset", "Vendor B", 1, 4200000),
  ]),
  mk("Rizky", "Youth Retreat NRG 2026", "GARA Community", "2026-08-07", 1, 1, "Lembang", "Indonesia", [
    it("SND-02", "Speaker Portable Set", "Audio", "Vendor C", 3, 4500000),
    it("MIC-01", "Mic Wireless Handheld", "Audio", "Vendor D", 4, 2400000),
    it("LGT-04", "Par Led Stage Light", "Lighting", "Vendor B", 10, 3000000),
    it("DOC-02", "Photography Crew", "Documentation", "Vendor F", 1, 3000000),
  ]),
  mk("Vina", "Product Launch - Meridian Tech", "Meridian Technologies", "2026-09-03", 1, 1, "Jakarta", "Indonesia", [
    it("LED-02", "LED Panel P4", "LED", "Vendor A", 90, 56250000),
    it("LGT-01", "Moving Head Spot", "Lighting", "Vendor B", 30, 27000000),
    it("SND-04", "Line Array Speaker", "Audio", "Vendor C", 16, 37000000),
    it("RIG-02", "Truss Support 6m", "Rigging", "Vendor E", 24, 14400000),
    it("MUL-01", "LED Video Wall Content", "Multimedia", "Vendor G", 1, 15000000),
  ]),
  mk("Nadia", "Wedding Reception - Kevin & Marsha", "Keluarga Kevin", "2026-09-12", 1, 0, "Bandung", "Indonesia", [
    it("LED-01", "LED Panel P3", "LED", "Vendor A", 36, 28800000),
    it("SND-04", "Line Array Speaker", "Audio", "Vendor C", 8, 18500000),
    it("GEN-02", "Genset 50kVA", "Genset", "Vendor B", 1, 4200000),
  ]),
];

// Hash string sederhana dan deterministik (bukan acak sungguhan) — dipakai
// hanya untuk memberi status pembayaran default pada data SAMPLE_EVENTS
// yang tidak pernah mencantumkannya secara eksplisit, supaya section
// "Status Pembayaran" tetap punya variasi untuk didemokan. Begitu backend
// (Code.gs) mengirim KETERANGAN/NOMINAL DP/SISA DP asli dari sheet, nilai
// asli itu yang dipakai — fungsi ini tidak pernah menimpa data nyata.
function _hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function _defaultPaymentStatus(itemCode, vendor, totalPrice) {
  const h = _hashStr(String(itemCode) + "|" + String(vendor) + "|" + String(totalPrice));
  const bucket = h % 10;
  if (bucket <= 5) return { status: "Lunas", nominalDP: totalPrice };
  if (bucket <= 8) return { status: "DP", nominalDP: Math.round(totalPrice * (0.3 + (h % 3) * 0.15)) };
  return { status: "Belum Bayar", nominalDP: 0 };
}

function it(itemCode, itemName, category, vendor, quantity, totalPrice, paymentStatus, nominalDP) {
  let status = paymentStatus;
  let dp = nominalDP;
  if (!status) {
    const d = _defaultPaymentStatus(itemCode, vendor, totalPrice);
    status = d.status;
    if (dp == null) dp = d.nominalDP;
  }
  dp = Math.max(0, Math.min(Number(dp) || 0, totalPrice));
  const sisaDP = status === "Lunas" ? 0 : Math.max(0, totalPrice - dp);
  return { itemCode, itemName, category, vendor, quantity, totalPrice, paymentStatus: status, nominalDP: dp, sisaDP };
}

// Menjamin setiap item punya field paymentStatus/nominalDP/sisaDP, apa pun
// sumber datanya. Data dari SAMPLE_EVENTS (lewat it() di atas) sudah selalu
// punya field ini. Data dari backend nyata (CONFIG.API_URL) yang BELUM
// diperbarui untuk mengirim KETERANGAN/NOMINAL DP/SISA DP akan ditandai
// "Tidak Diketahui" — bukan ditebak jadi Lunas/DP — supaya dashboard tidak
// menyesatkan sebelum Code.gs & sheet ITEMS diperbarui ke skema baru.
function ensurePaymentFields(events) {
  return events.map((ev) => ({
    ...ev,
    items: ev.items.map((item) =>
      item.paymentStatus
        ? item
        : { ...item, paymentStatus: "Tidak Diketahui", nominalDP: 0, sisaDP: 0 }
    ),
  }));
}

function mk(user, event, client, eventDate, eventDays, gr, city, country, items) {
  const eventPrice = items.reduce((sum, i) => sum + i.totalPrice, 0);
  // eventDateEnd is derived the same way a real submission derives it:
  // start date + (eventDays - 1), since eventDays is inclusive of both ends.
  const endDate = new Date(eventDate + "T00:00:00");
  endDate.setDate(endDate.getDate() + (eventDays - 1));
  const eventDateEnd = endDate.toISOString().slice(0, 10);
  // submittedAt is spread a few hours after the event date so "last updated"
  // has realistic variety in the sample data.
  const submittedAt = new Date(eventDate + "T09:00:00");
  submittedAt.setDate(submittedAt.getDate() + 1);
  return {
    eventId: "smp-" + event.replace(/\s+/g, "-").toLowerCase(),
    user, event, client, eventPrice, eventDate, eventDateEnd, eventDays, gr, city, country,
    items,
    submittedAt: submittedAt.toISOString(),
  };
}

/* -------------------------------------------------------------------------
   Normalization
   ------------------------------------------------------------------------- */

// Collapses "Vendor A", "vendor a", " VENDOR A " into one canonical display
// label. The first form encountered (in dataset order) wins as the display
// label; raw stored data is never mutated.
function normalizeLabel(raw) {
  return String(raw || "").trim().replace(/\s+/g, " ");
}

function canonicalKey(raw) {
  return normalizeLabel(raw).toLowerCase();
}

// Builds a lookup of canonicalKey -> first-seen display label across a list
// of events, for vendors and item names respectively.
function buildLabelMap(events, picker) {
  const map = new Map();
  for (const ev of events) {
    for (const item of ev.items) {
      const raw = picker(item);
      const key = canonicalKey(raw);
      if (key && !map.has(key)) map.set(key, normalizeLabel(raw));
    }
  }
  return map;
}

/* -------------------------------------------------------------------------
   Loading
   ------------------------------------------------------------------------- */


function makeLocalEventId(dateStr, events) {
  const d = new Date(dateStr);
  const month = String(d.getMonth()+1).padStart(2, "0");
  const year = d.getFullYear();
  const count = events.filter((e) => { const ed = new Date(e.eventDate); return ed.getFullYear() === year && String(ed.getMonth()+1).padStart(2, "0") === month; }).length + 1;
  return `${month}-ke-${String(count).padStart(2,"0")}-ke-${year}`;
}
function readLocalSubmissions() {
  try {
    const raw = localStorage.getItem(CONFIG.LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Failed to read local submissions", e);
    return [];
  }
}

function writeLocalSubmission(report) {
  const all = readLocalSubmissions();
  all.push(report);
  localStorage.setItem(CONFIG.LOCAL_STORAGE_KEY, JSON.stringify(all));
}

// Apps Script web apps take a slow "cold start" round-trip (or even a
// dropped request) the first time they're hit after a while — every read
// below retries a few times with a short backoff before giving up, which
// is what actually fixes the "works on refresh" symptom instead of just
// wording the error message better. `onRetry(attempt, attempts)` is an
// optional hook so the caller's loading UI can say something while this
// happens, instead of sitting on the first label the whole time.
async function apiFetchJSON(url, options, onRetry) {
  const attempts = 3;
  const baseDelayMs = 900;
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        if (onRetry) { try { onRetry(i + 2, attempts); } catch (_) {} }
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs * (i + 1)));
      }
    }
  }
  throw lastErr;
}

// Loads the full dataset. In local/demo mode this is the bundled sample
// data plus anything the user has submitted through input.html in this
// browser. When CONFIG.API_URL is set, it fetches from the Apps Script
// backend instead.
async function loadAllEvents(onRetry) {
  if (CONFIG.API_URL) {
    const payload = await apiFetchJSON(CONFIG.API_URL + "?action=getAnalytics", undefined, onRetry);
    return payload.events || [];
  }
  return [...SAMPLE_EVENTS, ...readLocalSubmissions()];
}

// Daftar event ringkas (tanpa detail item) untuk halaman events.html
// ("Daftar Event"). Lebih cepat daripada loadAllEvents() saat memakai
// backend Apps Script karena action=getEventsList tidak mengirim seluruh
// baris ITEMS ke browser — hanya info yang perlu ditampilkan di daftar.
async function loadEventsList(onRetry) {
  if (CONFIG.API_URL) {
    const payload = await apiFetchJSON(CONFIG.API_URL + "?action=getEventsList", undefined, onRetry);
    return payload.events || [];
  }
  const events = [...SAMPLE_EVENTS, ...readLocalSubmissions()];
  return events.map((ev) => ({
    eventId: ev.eventId,
    event: ev.event,
    client: ev.client,
    city: ev.city,
    country: ev.country,
    eventDate: ev.eventDate,
    eventDays: ev.eventDays,
    eventPrice: ev.eventPrice,
    submittedAt: ev.submittedAt,
    updatedAt: ev.updatedAt,
    itemCount: (ev.items || []).length,
  }));
}

// Satu event lengkap (dengan item) berdasarkan eventId — dipakai untuk
// mengisi ulang form input.html saat tombol "Edit" diklik. `isLocal` pada
// hasilnya menandai event ini hanya ada di localStorage browser ini (mode
// demo tanpa backend), supaya UI bisa memberi tahu kalau event contoh
// (SAMPLE_EVENTS) tidak bisa diedit.
async function loadEventById(eventId, onRetry) {
  if (CONFIG.API_URL) {
    const payload = await apiFetchJSON(CONFIG.API_URL + "?action=getEventById&eventId=" + encodeURIComponent(eventId), undefined, onRetry);
    if (!payload.ok) throw new Error(payload.error || "Event tidak ditemukan.");
    return payload.event;
  }
  const local = readLocalSubmissions();
  const found = local.find((ev) => ev.eventId === eventId);
  if (found) return found;
  const sample = SAMPLE_EVENTS.find((ev) => ev.eventId === eventId);
  if (sample) {
    const err = new Error("Event contoh (sample) tidak bisa diedit dalam mode demo.");
    err.isSampleEvent = true;
    throw err;
  }
  throw new Error("Event tidak ditemukan.");
}

// Ringkasan angka saja (jumlah event, vendor unik, jenis barang unik) untuk
// strip "sekilas" di index.html. Dipakai supaya landing page tidak perlu
// menarik seluruh dataset (loadAllEvents) hanya untuk 3 angka ini — sama
// persis hasilnya, hanya jalur & payload-nya yang lebih ringan/cepat.
async function loadStats(onRetry) {
  if (CONFIG.API_URL) {
    const payload = await apiFetchJSON(CONFIG.API_URL + "?action=getStats", undefined, onRetry);
    return {
      eventCount: payload.eventCount || 0,
      vendorCount: payload.vendorCount || 0,
      itemCount: payload.itemCount || 0,
    };
  }
  const events = [...SAMPLE_EVENTS, ...readLocalSubmissions()];
  const vendors = new Set();
  const items = new Set();
  events.forEach((ev) => ev.items.forEach((i) => {
    if (i.vendor) vendors.add(canonicalKey(i.vendor));
    if (i.itemName) items.add(canonicalKey(i.itemName));
  }));
  return { eventCount: events.length, vendorCount: vendors.size, itemCount: items.size };
}

// Menimpa satu laporan yang sudah ada di localStorage (mode demo tanpa
// backend) — dipakai oleh submitEvent() saat report.isEdit=true.
function updateLocalSubmission(report) {
  const all = readLocalSubmissions();
  const idx = all.findIndex((ev) => ev.eventId === report.eventId);
  if (idx === -1) throw new Error("Event tidak ditemukan di penyimpanan lokal.");
  all[idx] = report;
  localStorage.setItem(CONFIG.LOCAL_STORAGE_KEY, JSON.stringify(all));
}

// Loads the item & vendor dictionaries that power the searchable dropdowns
// in input.html. Same local-vs-API split as loadAllEvents(): falls back to
// the bundled arrays above when no backend is configured, so the dropdowns
// still work in "run locally" mode.
let _dictionariesCache = null;
// REVISI (DICTIONARY LIVE): Code.gs sekarang membaca sheet ITEM_DICTIONARY
// / VENDOR_DICTIONARY sungguhan (lihat readDictionaries_() di Code.gs),
// jadi fungsi ini kembali memanggil ?action=getDictionaries saat
// CONFIG.API_URL terisi — edit di kedua sheet itu langsung muncul di
// dropdown form input tanpa redeploy. Kalau API_URL kosong (mode demo
// lokal), atau request ini gagal/hasilnya kosong (mis. sheet belum dibuat,
// backend cold start error, dsb.), tetap fallback ke data bundled di bawah
// supaya dropdown tidak pernah blank.
async function loadDictionaries() {
  if (_dictionariesCache) return _dictionariesCache;

  if (CONFIG.API_URL) {
    try {
      const res = await fetch(`${CONFIG.API_URL}?action=getDictionaries`);
      if (!res.ok) throw new Error("Gagal memuat dictionary: " + res.status);
      const payload = await res.json();
      const items = payload && Array.isArray(payload.items) ? payload.items : [];
      const vendors = payload && Array.isArray(payload.vendors) ? payload.vendors : [];
      if (items.length && vendors.length) {
        _dictionariesCache = { items, vendors };
        return _dictionariesCache;
      }
      console.warn("loadDictionaries: hasil dari backend kosong, fallback ke data bundled.", payload);
    } catch (err) {
      console.error("loadDictionaries: gagal fetch dari backend, fallback ke data bundled.", err);
    }
  }

  _dictionariesCache = { items: ITEM_DICTIONARY_BUNDLED, vendors: VENDOR_DICTIONARY_BUNDLED };
  return _dictionariesCache;
}

async function submitEvent(report) {
  if (CONFIG.API_URL) {
    const res = await fetch(CONFIG.API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" }, // avoids CORS preflight on Apps Script
      body: JSON.stringify(report),
    });
    if (!res.ok) throw new Error("Failed to submit report: " + res.status);
    const payload = await res.json();
    if (payload && payload.ok === false) {
      throw new Error(payload.error || "Backend menolak data.");
    }
    // Picu sync sheet -> Firestore di eksekusi Apps Script TERPISAH, tanpa
    // menunggu hasilnya. Submit tetap cepat; kegagalan di sini diabaikan
    // (jaring pengaman trigger tetap menyinkronkan nanti).
    try {
      fetch(CONFIG.API_URL + "?action=sync", { method: "GET", mode: "no-cors", keepalive: true }).catch(function () {});
    } catch (_) {}
    return payload;
  }
  if (report.isEdit) {
    updateLocalSubmission(report);
    return { ok: true, eventId: report.eventId, updated: true };
  }
  writeLocalSubmission(report);
  return { ok: true, eventId: report.eventId };
}

/* -------------------------------------------------------------------------
   Statistics
   ------------------------------------------------------------------------- */

// Percentile using linear interpolation between closest ranks (equivalent
// to Excel's PERCENTILE.INC / "inclusive" method). Documented here because
// there are several competing quartile conventions; this is the one used
// consistently everywhere in this app.
function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return 0;
  if (sortedValues.length === 1) return sortedValues[0];
  const rank = p * (sortedValues.length - 1);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  const weight = rank - lowerIndex;
  if (lowerIndex === upperIndex) return sortedValues[lowerIndex];
  return sortedValues[lowerIndex] * (1 - weight) + sortedValues[upperIndex] * weight;
}

function computePriceStats(events) {
  const values = events.map((e) => e.eventPrice).sort((a, b) => a - b);
  const n = values.length;
  if (n === 0) {
    return { mean: 0, median: 0, q1: 0, q3: 0, min: 0, max: 0, n: 0 };
  }
  const mean = values.reduce((s, v) => s + v, 0) / n;
  return {
    mean,
    median: percentile(values, 0.5),
    q1: percentile(values, 0.25),
    q3: percentile(values, 0.75),
    min: values[0],
    max: values[n - 1],
    n,
  };
}

// Vendor aggregation. "eventCount" = number of DISTINCT events that used
// this vendor at least once (never conflate with item occurrences or pcs).
function aggregateVendors(events) {
  const labelMap = buildLabelMap(events, (i) => i.vendor);
  const byKey = new Map();
  for (const ev of events) {
    const vendorsInThisEvent = new Set();
    for (const item of ev.items) {
      const key = canonicalKey(item.vendor);
      if (!key) continue;
      vendorsInThisEvent.add(key);
      if (!byKey.has(key)) {
        byKey.set(key, { vendor: labelMap.get(key), eventIds: new Set(), itemOccurrences: 0, totalSpending: 0 });
      }
      const rec = byKey.get(key);
      rec.itemOccurrences += 1;
      rec.totalSpending += Number(item.totalPrice) || 0;
    }
    for (const key of vendorsInThisEvent) byKey.get(key).eventIds.add(ev.eventId);
  }
  return [...byKey.values()].map((r) => ({
    vendor: r.vendor,
    eventCount: r.eventIds.size,
    itemOccurrences: r.itemOccurrences,
    totalSpending: r.totalSpending,
    avgSpendingPerEvent: r.eventIds.size ? r.totalSpending / r.eventIds.size : 0,
  }));
}

// Item aggregation. "eventCount" = distinct events the item appeared in,
// "occurrences" = number of line entries across all events (an item can
// appear more than once per event with different vendors), "totalQty" =
// sum of pcs, kept separate from both of the above per the spec.
function aggregateItems(events) {
  const labelMap = buildLabelMap(events, (i) => i.itemName);
  const byKey = new Map();
  for (const ev of events) {
    const itemsInThisEvent = new Set();
    for (const item of ev.items) {
      const key = canonicalKey(item.itemName);
      if (!key) continue;
      itemsInThisEvent.add(key);
      if (!byKey.has(key)) {
        byKey.set(key, { itemName: labelMap.get(key), eventIds: new Set(), occurrences: 0, totalQty: 0, totalSpending: 0 });
      }
      const rec = byKey.get(key);
      rec.occurrences += 1;
      rec.totalQty += Number(item.quantity) || 0;
      rec.totalSpending += Number(item.totalPrice) || 0;
    }
    for (const key of itemsInThisEvent) byKey.get(key).eventIds.add(ev.eventId);
  }
  return [...byKey.values()].map((r) => ({
    itemName: r.itemName,
    eventCount: r.eventIds.size,
    occurrences: r.occurrences,
    totalQty: r.totalQty,
    totalSpending: r.totalSpending,
  }));
}

// Item x Vendor combinations — the pairing the spec calls a headline
// visualization.
function aggregateItemVendor(events) {
  const itemLabels = buildLabelMap(events, (i) => i.itemName);
  const vendorLabels = buildLabelMap(events, (i) => i.vendor);
  const byKey = new Map();
  for (const ev of events) {
    for (const item of ev.items) {
      const itemKey = canonicalKey(item.itemName);
      const vendorKey = canonicalKey(item.vendor);
      if (!itemKey || !vendorKey) continue;
      const key = itemKey + "::" + vendorKey;
      if (!byKey.has(key)) {
        byKey.set(key, {
          itemName: itemLabels.get(itemKey),
          vendor: vendorLabels.get(vendorKey),
          frequency: 0,
          totalPcs: 0,
          totalSpending: 0,
        });
      }
      const rec = byKey.get(key);
      rec.frequency += 1;
      rec.totalPcs += Number(item.quantity) || 0;
      rec.totalSpending += Number(item.totalPrice) || 0;
    }
  }
  return [...byKey.values()];
}

// ISO-week number (1-53) within the event's own year, used for the "peak
// week" view. Weeks are Monday-start.
function isoWeek(dateStr) {
  const d = new Date(Date.UTC(new Date(dateStr).getFullYear(), new Date(dateStr).getMonth(), new Date(dateStr).getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return week;
}

function aggregatePeakWeek(events) {
  const byWeek = new Map();
  for (const ev of events) {
    const w = isoWeek(ev.eventDate);
    byWeek.set(w, (byWeek.get(w) || 0) + 1);
  }
  return [...byWeek.entries()].map(([week, count]) => ({ week, count })).sort((a, b) => a.week - b.week);
}

const MONTH_LABELS_ID = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function aggregatePeakMonth(events) {
  const byMonth = new Map();
  for (const ev of events) {
    const m = new Date(ev.eventDate).getMonth();
    byMonth.set(m, (byMonth.get(m) || 0) + 1);
  }
  return MONTH_LABELS_ID.map((label, m) => ({ month: m, label, count: byMonth.get(m) || 0 }));
}

// Monthly spending + event count timeline, keyed by calendar month across
// the full span of the dataset (not just months with SAMPLE_EVENTS entries)
// so trend lines don't skip gaps.
function aggregateMonthlyTimeline(events) {
  if (events.length === 0) return [];
  const byMonth = new Map();
  for (const ev of events) {
    const d = new Date(ev.eventDate);
    const key = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    if (!byMonth.has(key)) byMonth.set(key, { key, year: d.getFullYear(), month: d.getMonth(), spending: 0, eventCount: 0 });
    const rec = byMonth.get(key);
    rec.eventCount += 1;
    rec.spending += ev.items.reduce((s, i) => s + (Number(i.totalPrice) || 0), 0);
  }
  return [...byMonth.values()]
    .sort((a, b) => (a.year - b.year) || (a.month - b.month))
    .map((r) => ({ ...r, label: MONTH_LABELS_ID[r.month] + " " + r.year, avgPerEvent: r.eventCount ? r.spending / r.eventCount : 0 }));
}

/* -------------------------------------------------------------------------
   Status Pembayaran — dipakai oleh section "Status Pembayaran" dan
   "Perlu Diperhatikan" di analytics.html.
   ------------------------------------------------------------------------- */

// committed  = total nilai seluruh item (procurement), apa pun statusnya.
// paid       = nominal yang sudah benar-benar keluar (Lunas penuh, atau DP
//              sebesar nominalnya).
// outstanding= sisa yang masih harus dibayar (sisa DP + item Belum Bayar) —
//              inilah nominal yang ditampilkan sebagai variabel ketiga
//              "Belum Dibayar" di donat status pembayaran.
// dpTotal    = total HARGA item berstatus DP (dipakai untuk hitung sisa).
// dpPaidTotal= dari dpTotal itu, bagian yang SUDAH benar-benar dibayarkan
//              sebagai DP (variabel "DP" di donat) — sisanya (dpTotal -
//              dpPaidTotal) ikut masuk ke `outstanding`/"Belum Dibayar".
// unknownTotal / unknownCount = item yang statusnya belum tercatat sama
//              sekali (backend lama) — dihitung di committed, tapi TIDAK
//              dimasukkan ke paid/outstanding karena memang belum diketahui.
function computePaymentSummary(events) {
  let committed = 0, paid = 0, outstanding = 0, unknownTotal = 0;
  let lunasTotal = 0, dpTotal = 0, dpPaidTotal = 0, belumTotal = 0;
  let lunasCount = 0, dpCount = 0, belumCount = 0, unknownCount = 0;
  for (const ev of events) {
    for (const item of ev.items) {
      const price = Number(item.totalPrice) || 0;
      committed += price;
      if (item.paymentStatus === "Lunas") {
        paid += price; lunasTotal += price; lunasCount++;
      } else if (item.paymentStatus === "DP") {
        const dp = Math.min(Number(item.nominalDP) || 0, price);
        paid += dp; outstanding += price - dp;
        dpTotal += price; dpPaidTotal += dp; dpCount++;
      } else if (item.paymentStatus === "Belum Bayar") {
        outstanding += price; belumTotal += price; belumCount++;
      } else {
        unknownTotal += price; unknownCount++;
      }
    }
  }
  return { committed, paid, outstanding, unknownTotal, lunasTotal, dpTotal, dpPaidTotal, belumTotal, lunasCount, dpCount, belumCount, unknownCount };
}

// Baris-baris item dengan outstanding terbesar, lintas semua event —
// dipakai untuk daftar "Outstanding Terbesar" di section Status Pembayaran.
function aggregateOutstandingList(events, limit = 8) {
  const rows = [];
  for (const ev of events) {
    for (const item of ev.items) {
      const price = Number(item.totalPrice) || 0;
      let outstanding = 0;
      if (item.paymentStatus === "DP") outstanding = Math.max(0, price - (Number(item.nominalDP) || 0));
      else if (item.paymentStatus === "Belum Bayar") outstanding = price;
      if (outstanding > 0) {
        rows.push({ event: ev.event, eventDate: ev.eventDate, itemName: item.itemName, vendor: item.vendor, outstanding });
      }
    }
  }
  return rows.sort((a, b) => b.outstanding - a.outstanding).slice(0, limit);
}


/* -------------------------------------------------------------------------
   Filter Tanggal — kontrol global di analytics.html. Filter berdasarkan
   Tanggal Event (hari pertama event berlangsung), sesuai kesepakatan.
   ------------------------------------------------------------------------- */
function filterEventsByDateRange(events, fromISO, toISO) {
  if (!fromISO && !toISO) return events;
  return events.filter((ev) => {
    if (fromISO && ev.eventDate < fromISO) return false;
    if (toISO && ev.eventDate > toISO) return false;
    return true;
  });
}

function _toISODate(d) { return d.toISOString().slice(0, 10); }

// Preset cepat, dihitung relatif terhadap tanggal hari ini (device/server).
function presetRange(key) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const start = new Date(now);
  switch (key) {
    case "today": break;
    case "week": start.setDate(now.getDate() - now.getDay()); break;
    case "month": start.setDate(1); break;
    case "year": start.setMonth(0, 1); break;
    case "last7": start.setDate(now.getDate() - 6); break;
    case "last30": start.setDate(now.getDate() - 29); break;
    default: return { from: null, to: null };
  }
  return { from: _toISODate(start), to: _toISODate(now) };
}

// Waktu terakhir sebuah event disimpan: saat pertama disubmit ATAU saat
// terakhir diedit (updatedAt), mana yang lebih baru. Event lama yang belum
// punya updatedAt otomatis memakai submittedAt.
function getEventUpdatedAt(ev) {
  const sub = new Date(ev && ev.submittedAt).getTime();
  const upd = new Date(ev && ev.updatedAt).getTime();
  return Math.max(isNaN(sub) ? 0 : sub, isNaN(upd) ? 0 : upd);
}

function getLastUpdated(events) {
  if (events.length === 0) return null;
  return events.reduce((latest, ev) => {
    const t = getEventUpdatedAt(ev);
    return t > latest ? t : latest;
  }, 0);
}

/* -------------------------------------------------------------------------
   Formatting
   ------------------------------------------------------------------------- */

function formatRupiah(value) {
  return "Rp " + Math.round(value).toLocaleString("id-ID");
}

function formatRupiahCompact(value) {
  if (value >= 1e9) return "Rp " + (value / 1e9).toFixed(1).replace(/\.0$/, "") + " M";
  if (value >= 1e6) return "Rp " + (value / 1e6).toFixed(1).replace(/\.0$/, "") + " Jt";
  if (value >= 1e3) return "Rp " + (value / 1e3).toFixed(0) + " Rb";
  return "Rp " + Math.round(value);
}

function formatDateID(dateStr) {
  return new Date(dateStr).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

function formatDateTimeID(timestamp) {
  const d = new Date(timestamp);
  const date = d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  const time = d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false });
  return { date, time: time + " WIB" };
}