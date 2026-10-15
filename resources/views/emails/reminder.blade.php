@php
    /*
     * Reminder email.
     *
     * Inline styles throughout: email clients strip <style> blocks and external
     * stylesheets (Gmail in particular), so anything not inlined silently
     * disappears. No web fonts either — the app forbids CDN assets, and mail
     * clients would block them anyway, so this uses the system stack.
     */
    $isId = ($locale ?? 'en') === 'id';
    $greeting = $isId ? 'Halo' : 'Hi';
    $footer = $isId
        ? 'Kamu menerima email ini karena kamu punya trainer di Striv. Bisa diatur di Pengaturan.'
        : 'You are receiving this because you train with a coach on Striv. Manage this in Settings.';
    $settingsLabel = $isId ? 'Atur pengingat' : 'Manage reminders';
    $settingsUrl = rtrim(config('app.url'), '/').'/settings';
@endphp
<!DOCTYPE html>
<html lang="{{ $locale ?? 'en' }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $title }}</title>
</head>
<body style="margin:0;padding:0;background:#FDF8F8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1C1B1B;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FDF8F8;padding:32px 16px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid #E5E2E1;border-radius:12px;overflow:hidden;">
                    <tr>
                        <td style="padding:24px 28px;border-bottom:1px solid #E5E2E1;">
                            <span style="font-size:20px;font-weight:800;letter-spacing:-0.02em;color:#000000;">Striv</span>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding:28px;">
                            <p style="margin:0 0 8px;font-size:14px;color:#747878;">
                                {{ $greeting }}, {{ $member->name }}
                            </p>

                            <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:700;color:#1C1B1B;">
                                {{ $title }}
                            </h1>

                            @foreach ($lines as $line)
                                <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#46464A;">
                                    {{ $line }}
                                </p>
                            @endforeach

                            @if ($actionLabel !== '')
                                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
                                    <tr>
                                        <td style="border-radius:10px;background:#000000;">
                                            <a href="{{ $actionUrl }}"
                                               style="display:inline-block;padding:14px 28px;font-size:14px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;">
                                                {{ $actionLabel }}
                                            </a>
                                        </td>
                                    </tr>
                                </table>
                            @endif
                        </td>
                    </tr>

                    <tr>
                        <td style="padding:20px 28px;border-top:1px solid #E5E2E1;background:#FDF8F8;">
                            <p style="margin:0 0 6px;font-size:12px;line-height:1.6;color:#747878;">
                                {{ $footer }}
                            </p>
                            <a href="{{ $settingsUrl }}" style="font-size:12px;color:#4648D4;text-decoration:none;">
                                {{ $settingsLabel }}
                            </a>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
