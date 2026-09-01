<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AiReport extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'type',
        'week_start',
        'content',
        'generated_at',
        'delivered_at',
    ];

    protected $casts = [
        'week_start' => 'date',
        'content' => 'array',
        'generated_at' => 'datetime',
        'delivered_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}