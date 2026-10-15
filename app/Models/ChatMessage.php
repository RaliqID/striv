<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class ChatMessage extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'chat_session_id',
        'role',
        'content',
        'image_path',
    ];

    /**
     * Remove the attached image file when the message row goes away.
     *
     * -----------------------------------------------------------------------
     * THE LEAK THIS FIXES
     * -----------------------------------------------------------------------
     * The database cascades — `chat_messages.chat_session_id` has
     * `on delete cascade`, so deleting a session removes its messages. But a
     * cascade is a DATABASE operation: it deletes rows directly and Eloquent
     * never instantiates the models, so no model event fires and the image file
     * on disk is never touched.
     *
     * The result was measured on this database: 15 image files on disk, only 4
     * still referenced by a live message, and 11 orphans wasting 34 KB. That
     * figure grows with every image a member sends into a conversation they
     * later delete, forever, with nothing to reclaim it.
     *
     * -----------------------------------------------------------------------
     * WHY THE FILE IS REMOVED AFTER THE ROW
     * -----------------------------------------------------------------------
     * `deleting` fires before the row is gone. Deleting the file first would
     * mean that if the row delete then failed, the message would survive
     * pointing at an image that no longer exists — a broken attachment shown to
     * the member. Removing the file after the row is committed means the worst
     * case is an orphaned file (invisible, reclaimable) rather than a broken
     * message (visible, wrong).
     *
     * That ordering is also why this cannot simply be a cascade-level concern:
     * a database cannot delete a file.
     */
    protected static function booted(): void
    {
        static::deleted(function (ChatMessage $message) {
            if (empty($message->image_path)) {
                return;
            }

            try {
                $path = ltrim($message->image_path, '/');

                if (Storage::disk('public')->exists($path)) {
                    Storage::disk('public')->delete($path);
                }
            } catch (\Throwable $e) {
                /*
                 * A failed file cleanup must not surface as a failed delete.
                 * The row is already gone, so the member's action succeeded; the
                 * leftover file is invisible and can be swept later. Logged so it
                 * is not silent.
                 */
                Log::warning('Could not delete chat image for message '.$message->id, [
                    'path' => $message->image_path,
                    'error' => $e->getMessage(),
                ]);
            }
        });
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function session(): BelongsTo
    {
        return $this->belongsTo(ChatSession::class, 'chat_session_id');
    }

    /**
     * Public URL for the attached image (null when none).
     */
    public function getImageUrlAttribute(): ?string
    {
        if (empty($this->image_path)) {
            return null;
        }

        return asset('storage/' . ltrim($this->image_path, '/'));
    }
}
