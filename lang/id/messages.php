<?php

/*
|--------------------------------------------------------------------------
| Pesan aplikasi (Bahasa Indonesia)
|--------------------------------------------------------------------------
|
| Terjemahan dari lang/en/messages.php. Kunci harus sama persis dengan versi
| Inggris — kalau ada yang beda, aplikasi akan diam-diam jatuh ke teks Inggris
| dan tidak ketahuan ada yang belum diterjemahkan.
|
*/

return [
    // Umum
    'saved' => 'Tersimpan.',
    'updated' => 'Diperbarui.',
    'deleted' => 'Dihapus.',
    'unauthorized' => 'Kamu perlu masuk dulu untuk melanjutkan.',
    'forbidden' => 'Kamu tidak punya akses ke sini.',

    // Autentikasi
    'auth.logged_out' => 'Kamu sudah keluar.',
    'auth.invalid_credentials' => 'Email atau kata sandi salah.',
    'auth.suspended' => 'Akun diblokir. Hubungi dukungan.',
    'auth.too_many_attempts' => 'Terlalu banyak percobaan masuk. Coba lagi dalam :minutes menit.',

    // Pelatihan — sisi member
    'training.request_queued' => 'Permintaanmu sudah masuk antrean — kami akan mencarikan trainer secepatnya.',
    'training.trainer_assigned' => 'Seorang trainer sudah ditugaskan untukmu.',
    'training.no_active_trainer' => 'Kamu belum punya trainer aktif.',
    'training.slot_proposed' => 'Jadwal diajukan. Trainermu akan mengonfirmasi.',
    'training.slot_confirmed' => 'Jadwal dikonfirmasi.',
    'training.slot_declined' => 'Jadwal ditolak.',
    'training.released_rematched' => 'Trainermu sudah diganti. Trainer baru sudah ditugaskan.',
    'training.released_waiting' => 'Trainermu sudah dilepas. Kami akan mencarikan pengganti secepatnya.',
    'training.rating_thanks' => 'Terima kasih — penilaianmu membantu kami mencocokkan member dengan lebih tepat.',

    // Pelatihan — sisi trainer
    'training.not_coaching' => 'Kamu bukan trainer untuk member ini.',
    'training.no_active_relationship' => 'Tidak ada hubungan kepelatihan yang aktif.',
    'training.feedback_sent' => 'Catatan terkirim.',
    'training.live_note_sent' => 'Catatan langsung terkirim.',
    'training.schedule_sent' => 'Jadwal dikirim ke klienmu untuk dikonfirmasi.',
    'training.program_assigned' => 'Program sudah diberikan ke klienmu.',
    'training.program_removed' => 'Program dihapus.',
    'training.availability_on' => 'Kamu sedang menerima klien baru.',
    'training.availability_off' => 'Kamu tidak akan menerima klien baru.',

    // Pelatihan — sisi admin
    'training.already_has_trainer' => 'Permintaan ini sudah punya trainer.',
    'training.not_a_trainer' => 'Pengguna itu bukan trainer.',
    'training.trainer_suspended' => 'Trainer itu sedang diblokir.',
    'training.assigned' => 'Trainer ditugaskan.',
    'training.reassigned' => 'Member dipindahkan ke trainer lain.',
    'training.already_coached_by' => 'Sudah dilatih oleh trainer itu.',
    'training.already_trainer' => 'Sudah menjadi trainer.',
    'training.trainer_created' => 'Trainer dibuat.',
    'training.trainer_created_matched' => 'Trainer dibuat. :count member yang menunggu sudah ditugaskan.',
    'training.rematch_none' => 'Belum ada member yang bisa dicocokkan — mungkin semua trainer sudah penuh.',
    'training.rematch_done' => ':count member yang menunggu sudah ditugaskan.',

    // Perubahan role
    'role.changed' => 'Role diubah dari :from ke :to.',
    'role.unchanged' => 'Role tidak berubah.',

    // Notifikasi
    'notify.trainer_assigned_title' => 'Personal trainer-mu sudah siap',
    'notify.trainer_assigned_body' => ':name sudah ditugaskan untukmu. Dia akan mengonfirmasi jadwalmu sebentar lagi.',
    'notify.client_assigned_title' => 'Klien baru ditugaskan',
    'notify.client_assigned_body' => 'Kamu sekarang melatih :name. Konfirmasi jadwalnya untuk mulai.',
    'notify.schedule_proposed_title' => 'Trainermu mengajukan jadwal',
    'notify.schedule_proposed_body' => ':name mengusulkan :count hari latihan. Tinjau dan konfirmasi.',
    'notify.schedule_confirmed_title' => 'Jadwal dikonfirmasi',
    'notify.schedule_confirmed_body' => ':name menerima jadwal latihannya.',
    'notify.client_waiting_title' => 'Ada member yang menunggu trainer',
    'notify.client_waiting_body' => ':name mengajukan permintaan pelatihan',
    'notify.client_waiting_body_goal' => ':name mengajukan pelatihan untuk :goal.',
    'notify.released_title' => 'Trainermu berganti',
    'notify.released_body' => 'Trainer sebelumnya sudah tidak tersedia. Kami sedang mencarikan penggantinya.',
    'notify.live_note_title' => 'Catatan langsung saat latihan',
    'notify.feedback_title' => 'Catatan baru dari trainermu',
    'notify.feedback_body' => ':name meninggalkan catatan untukmu.',
    'notify.feedback_body_session' => ':name meninggalkan catatan pada sesi latihanmu.',
    'notify.rating_title' => 'Kamu menerima penilaian',
    'notify.rating_body' => ':name menilai kepelatihanmu :rating/5.',

    // Bahasa
    'locale.updated' => 'Bahasa diperbarui.',

    // ------------------------------------------------------------------
    // Pengingat konsistensi
    // ------------------------------------------------------------------
    // ------------------------------------------------------------------
    // Catatan pelatih untuk program yang di-generate
    //
    // Dirender saat dibaca dari goal/pengalaman/frekuensi yang tersimpan, jadi
    // bahasanya ikut bahasa member, bukan terkunci ke Inggris.
    // ------------------------------------------------------------------
    'program.note_goal_muscle' => 'Fokus hipertrofi. Kontrol fase turun (2-3 detik) dan sisakan 1-2 repetisi cadangan di setiap set.',
    'program.note_goal_strength' => 'Dibangun dari gerakan utama. Istirahat 2-3 menit antar set - tujuannya kekuatan, bukan kelelahan.',
    'program.note_goal_endurance' => 'Fokus ketahanan. Jaga istirahat di bawah 60 detik dan selesaikan tiap set dengan napas berat tapi terkontrol.',

    'program.note_experience_beginner' => 'Teknik dulu. Pakai beban yang bisa kamu kontrol di setiap repetisi, dan hentikan set kalau form-nya rusak.',
    'program.note_experience_intermediate' => 'Progressive overload: tambah beban terkecil begitu semua set mencapai target repetisi.',
    'program.note_experience_advanced' => 'Volume diatur untuk pengangkat berpengalaman. Sesuaikan kalau pemulihanmu terganggu.',

    'program.note_frequency' => 'Dijadwalkan sekitar :count hari latihan per minggu.',
    'program.note_frequency_high' => 'Kamu latihan :count hari seminggu, jadi bikin sesi tetap singkat dan prioritaskan tidur.',
    'program.note_review' => 'Trainermu akan meninjau ini dan menyesuaikan bebannya setelah sesi pertamamu.',
    // ------------------------------------------------------------------
    // Bukti foto latihan
    // ------------------------------------------------------------------
    'photo.invalid_image' => 'Gambar tidak bisa dibaca. Coba ambil fotonya lagi.',
    'photo.too_large' => 'Fotonya terlalu besar. Coba lagi — ukurannya akan dikecilkan otomatis.',
    'photo.no_exercise' => 'Set ini tidak terhubung ke gerakan, jadi tidak bisa diverifikasi.',
    'photo.not_found' => 'Foto tidak ditemukan.',
    'photo.accepted' => 'Foto terverifikasi — set selesai.',
    'photo.accepted_unverified' => 'Foto tersimpan, tapi pemeriksaannya tidak bisa dijalankan sekarang. Trainer akan meninjau.',
    'photo.rejected' => 'Foto ini sepertinya bukan gerakan yang sedang kamu catat. Ambil foto alat atau gerakannya langsung.',
    'photo.removed' => 'Foto dihapus. Set ini tidak lagi ditandai selesai.',
    'photo.required' => 'Foto wajib disertakan untuk menyelesaikan set.',
    'photo.reviewed' => 'Sudah ditinjau trainer.',
    // ------------------------------------------------------------------
    // Percakapan pelatih AI
    //
    // Judul disimpan, jadi diterjemahkan saat ditulis, bukan saat dibaca.
    // ------------------------------------------------------------------
    'chat.new_session' => 'Percakapan baru',
    'chat.photo_checkin' => 'Cek foto',
    'reminder.training_generic' => 'latihan',

    // ------------------------------------------------------------------
    // Insight latihan
    //
    // Judul dan ringkasan untuk pola yang terdeteksi. Dibangun saat dibaca dari
    // tipe pola + buktinya, jadi bahasanya ikut bahasa member, bukan terkunci
    // ke Inggris.
    // ------------------------------------------------------------------
    'insight.progress.title' => 'Kekuatan :exercise sedang naik',
    'insight.progress.summary' => 'Perkiraan 1RM naik :pct% dalam :weeks minggu.',
    'insight.plateau.title' => 'Performa :exercise sedang mendatar',
    'insight.plateau.summary' => 'Perkiraan 1RM hanya bergerak dalam :pct% selama :weeks minggu terakhir.',
    'insight.regression.title' => 'Kekuatan :exercise sedang menurun',
    'insight.regression.summary' => 'Perkiraan 1RM turun :pct% dalam :weeks minggu.',
    'insight.volume_up.title' => 'Volume latihan meningkat',
    'insight.volume_up.summary' => 'Volume mingguan naik :pct% dibanding periode sebelumnya.',
    'insight.volume_down.title' => 'Volume latihan menurun',
    'insight.volume_down.summary' => 'Volume mingguan turun :pct% dibanding periode sebelumnya.',
    'insight.consistency_up.title' => 'Konsistensi latihan meningkat',
    'insight.consistency_up.summary' => 'Kepatuhan naik dari :previous% ke :recent% dari target mingguanmu.',
    'insight.consistency_down.title' => 'Konsistensi latihan menurun',
    'insight.consistency_down.summary' => 'Kepatuhan turun dari :previous% ke :recent% dari target mingguanmu.',
    'insight.milestone.title' => ':count latihan selesai',
    'insight.milestone.summary' => 'Kamu sudah mencatat total :count sesi latihan.',

    // Rekomendasi cadangan (dipakai kalau tidak ada penyedia AI)
    'insight.rec.progress' => 'Coba tambah 2,5kg di sesi berikutnya untuk melanjutkan trennya.',
    'insight.rec.plateau' => 'Coba naikkan intensitas 5% atau minggu deload, lalu uji maksimal.',
    'insight.rec.regression' => 'Jadwalkan minggu pemulihan dan tinjau tidur + nutrisi sebelum deload.',
    'insight.rec.milestone' => 'Pasang target lebih tinggi untuk 100 sesi berikutnya.',
    'insight.rec.default' => 'Latihan tetap konsisten dan tinjau lagi minggu depan.',
    'insight.rec.volume_up' => 'Pertahankan volume ini; pantau RPE supaya tidak berlebihan.',
    'insight.rec.volume_down' => 'Kembalikan volume ke garis dasar secara bertahap.',
    'insight.rec.volume_flat' => 'Jaga volume sekarang dan pantau pemulihanmu.',
    'insight.rec.consistency_up' => 'Manfaatkan ini — pertimbangkan menambah hari ke-5 kalau pemulihanmu cukup.',
    'insight.rec.consistency_down' => 'Cari penyebabnya: waktu, energi, atau pemulihan. Targetkan minimal 2 sesi minggu ini.',
    'insight.rec.consistency_flat' => 'Pertahankan jadwalmu sekarang dan jaga pemulihan.',

    'reminder.morning_subject' => 'Hari ini: :focus',
    'reminder.morning_title' => 'Hari ini waktunya :focus',
    'reminder.morning_body' => 'Jadwalmu hari ini :focus. Program dan targetmu sudah siap.',
    'reminder.morning_line1' => 'Semua sudah disiapkan — kamu tinggal jalani dan catat angkanya.',
    'reminder.morning_line_trainer' => ':name akan melihat sesimu setelah selesai.',

    'reminder.streak_subject' => 'Latihanmu ketinggalan nih',
    'reminder.streak_title' => 'Kamu melewatkan :count sesi',
    'reminder.streak_body' => 'Sudah cukup lama sejak sesi terakhirmu.',
    'reminder.streak_line1' => 'Kamu melewatkan :count sesi terjadwal dalam dua minggu terakhir.',
    'reminder.streak_line2' => 'Satu sesi hari ini sudah cukup untuk balik ke jalur. Programmu masih ada.',

    'reminder.praise_subject' => 'Sesi tercatat',
    'reminder.praise_title' => 'Mantap — sesi selesai',
    'reminder.praise_body' => 'Kamu menyelesaikan sesi dengan :count gerakan.',
    'reminder.praise_line1' => ':count gerakan tercatat dan masuk ke programmu.',
    'reminder.praise_line2' => 'Trainermu bisa melihat sesi ini dan akan memasukkannya ke rencanamu.',

    'reminder.weekly_subject' => 'Latihanmu minggu ini',
    'reminder.weekly_title' => 'Rekap mingguan',
    'reminder.weekly_subject_met' => 'Kamu tuntasin rencana minggu ini',
    'reminder.weekly_title_met' => 'Rencana minggu ini tuntas',
    'reminder.weekly_body' => ':completed dari :scheduled sesi terjadwal selesai.',
    'reminder.weekly_line1' => 'Kamu menyelesaikan :completed dari :scheduled sesi terjadwal minggu ini.',
    'reminder.weekly_line_met' => 'Itu rencana penuh — konsistensi seperti inilah yang menggerakkan angkanya.',
    'reminder.weekly_line_more' => 'Sesi yang terlewat tetap tersedia; tidak ada yang hilang.',

    'reminder.missed_subject' => 'Sesi hari ini masih terbuka',
    'reminder.missed_title' => ':focus masih bisa dikejar',
    'reminder.missed_body' => 'Sesi hari ini belum tercatat.',
    'reminder.missed_line1' => 'Hari ini jadwalnya :focus dan masih ada waktu.',
    'reminder.missed_line2' => 'Kalau hari ini tidak memungkinkan, besok juga bisa — rencananya menyesuaikan.',

    'reminder.action_start' => 'Mulai sesi hari ini',
    'reminder.action_resume' => 'Ayo mulai lagi',
    'reminder.action_view' => 'Lihat perkembanganmu',
    'reminder.phone_required' => 'Isi nomor HP dulu sebelum mengaktifkan pengingat WhatsApp.',

    // Profil — foto profil
    'profile.avatar_invalid' => 'Berkas itu bukan gambar yang didukung. Pakai foto JPEG, PNG, atau WebP.',
    'profile.avatar_too_large' => 'Fotonya terlalu besar. Pilih yang di bawah 5 MB.',
    'profile.avatar_updated' => 'Foto profil diperbarui.',
    'profile.avatar_removed' => 'Foto profil dihapus.',
    'profile.avatar_cooldown' => 'Kamu bisa ganti foto lagi sekitar :hours jam lagi. Foto dibatasi satu kali ganti setiap dua hari.',
];
