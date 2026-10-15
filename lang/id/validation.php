<?php

/**
 * Indonesian validation messages.
 *
 * WHY THIS FILE EXISTS
 *
 * Laravel ships English validation messages and falls back to them when the
 * active locale has no matching file. `lang/id/messages.php` existed but there
 * was no `lang/id/validation.php`, so a member reading the app in Indonesian
 * still got "The email field is required." — which is exactly the moment they
 * most need to understand what to fix.
 *
 * The app already had the plumbing: SetLocale middleware resolves the request
 * language, and the API client sends X-Locale. Verified end-to-end — the
 * response carried `Content-Language: id` while the message stayed English,
 * which is what proved the missing file was the cause rather than the locale
 * never arriving.
 *
 * SCOPE: only the rules this application actually uses, rather than copying
 * Laravel's full 12KB catalogue. Shipping 100+ unused translations would be
 * dead weight and would imply coverage the app does not exercise. The rules
 * below are the ones present in the codebase's validation calls:
 *
 *   required, email, string, numeric, integer, boolean, date, array,
 *   min, max, confirmed, unique, exists, in, same, regex
 *
 * If a new rule is introduced, add it here as well — otherwise that one message
 * silently reverts to English.
 */
return [

    'required' => 'Kolom :attribute wajib diisi.',
    'required_if' => 'Kolom :attribute wajib diisi bila :other bernilai :value.',
    'required_with' => 'Kolom :attribute wajib diisi bila :values ada.',
    'required_without' => 'Kolom :attribute wajib diisi bila :values tidak ada.',

    'email' => 'Kolom :attribute harus berupa alamat email yang valid.',
    'string' => 'Kolom :attribute harus berupa teks.',
    'numeric' => 'Kolom :attribute harus berupa angka.',
    'integer' => 'Kolom :attribute harus berupa bilangan bulat.',
    'boolean' => 'Kolom :attribute harus bernilai true atau false.',
    'date' => 'Kolom :attribute bukan tanggal yang valid.',
    'array' => 'Kolom :attribute harus berupa daftar.',

    'confirmed' => 'Konfirmasi :attribute tidak cocok.',
    'same' => 'Kolom :attribute dan :other harus sama.',
    'different' => 'Kolom :attribute dan :other harus berbeda.',
    'in' => 'Pilihan :attribute tidak valid.',
    'exists' => 'Pilihan :attribute tidak valid.',
    'unique' => ':attribute sudah digunakan.',
    'regex' => 'Format :attribute tidak valid.',

    'min' => [
        'numeric' => 'Kolom :attribute minimal :min.',
        'string' => 'Kolom :attribute minimal :min karakter.',
        'array' => 'Kolom :attribute minimal berisi :min item.',
    ],
    'max' => [
        'numeric' => 'Kolom :attribute maksimal :max.',
        'string' => 'Kolom :attribute maksimal :max karakter.',
        'array' => 'Kolom :attribute maksimal berisi :max item.',
    ],

    /*
     * NOTE: the "(and N more error(s))" suffix that Laravel appends when several
     * fields fail at once is deliberately NOT translated here.
     *
     * It looks like a validation key but is not one. ValidationException builds
     * the string inline:
     *
     *     $validator->getTranslator()->choice("(and :count more $pluralized)", ...)
     *
     * and MessageSelector parses any leading "(...)" as a plural-condition
     * pattern. ":count" is not a digit, so it matches nothing and the method
     * returns null, leaving the literal English text in place. There is no
     * lookup step, so no translation file can reach it — adding keys for it
     * (which was tried, and verified to have no effect) only misleads the next
     * reader into thinking the string is covered.
     *
     * Translating it would require replacing the framework's ValidationException
     * or a response formatter, which is out of proportion for one summary
     * suffix. The individual field messages above ARE localized, and those are
     * what the user acts on.
     */

    /*
     * Field names, so a message reads "Kolom kata sandi wajib diisi." rather
     * than leaking the column name. Only the fields this app validates are
     * listed; anything else falls back to Laravel's humanised column name.
     */
    'attributes' => [
        'name' => 'nama',
        'email' => 'email',
        'password' => 'kata sandi',
        'password_confirmation' => 'konfirmasi kata sandi',
        'current_password' => 'kata sandi saat ini',
        'phone' => 'nomor telepon',
        'age' => 'usia',
        'location' => 'lokasi',
        'weight_kg' => 'berat badan',
        'height_cm' => 'tinggi badan',
        'target_weight_kg' => 'berat badan target',
        'locale' => 'bahasa',
        'bio' => 'bio',
        'specialization' => 'spesialisasi',
        'training_frequency' => 'frekuensi latihan',
        'experience_level' => 'tingkat pengalaman',
        'primary_goal' => 'tujuan utama',
        'rating' => 'penilaian',
        'comment' => 'komentar',
        'message' => 'pesan',
        'image' => 'gambar',
        'day_of_week' => 'hari',
        'time_slot' => 'waktu',
        'focus' => 'fokus',
        'reps' => 'repetisi',
        'weight' => 'beban',
        'duration_minutes' => 'durasi',
        'notes' => 'catatan',
        'reason' => 'alasan',
    ],

];
