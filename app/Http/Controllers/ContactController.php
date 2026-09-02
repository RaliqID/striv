<?php

namespace App\Http\Controllers;

use App\Models\ContactMessage;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Public contact form endpoint (landing page).
 *
 * Messages are ALWAYS persisted to the database (no data loss), then an
 * email notification is attempted to CONTACT_NOTIFY_EMAIL via the
 * configured mailer. If mail is not configured, the message stays in DB
 * with status "new" — nothing is lost, email can be re-sent later.
 *
 * Rate limited: 3 messages per hour per IP.
 */
class ContactController extends Controller
{
    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:120',
            'email' => 'required|email|max:255',
            'message' => 'required|string|min:5|max:3000',
        ]);

        $contact = ContactMessage::create([
            'name' => $validated['name'],
            'email' => $validated['email'],
            'message' => $validated['message'],
            'status' => 'new',
        ]);

        $notifyEmail = config('mail.contact_notify_address', env('CONTACT_NOTIFY_EMAIL'));

        try {
            if ($notifyEmail) {
                Mail::raw(
                    "New message from the Striv landing page.\n\n"
                    . "Name: {$contact->name}\n"
                    . "Email: {$contact->email}\n"
                    . "Sent: {$contact->created_at->format('Y-m-d H:i')}\n\n"
                    . "Message:\n{$contact->message}\n\n"
                    . "—\nReply directly to: {$contact->email}",
                    function ($mail) use ($contact, $notifyEmail) {
                        $mail->to($notifyEmail)
                            ->replyTo($contact->email, $contact->name)
                            ->subject('Striv — new contact message from ' . $contact->name);
                    }
                );
                $contact->update(['status' => 'emailed', 'emailed_at' => now()]);
            }
        } catch (\Throwable $e) {
            // Mail not configured or failed — message is safe in DB.
            Log::warning('Contact email notification failed', [
                'contact_id' => $contact->id,
                'error' => $e->getMessage(),
            ]);
        }

        return response()->json([
            'message' => 'Thanks! Your message has been sent. We will reply to ' . $contact->email . ' soon.',
        ], 201);
    }
}
