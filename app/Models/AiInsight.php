<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AiInsight extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'type',
        'title',
        'summary',
        'evidence',
        'confidence',
        'time_range_start',
        'time_range_end',
        'generated_at',
    ];

    protected $casts = [
        'evidence' => 'array',
        'confidence' => 'decimal:2',
        'time_range_start' => 'datetime',
        'time_range_end' => 'datetime',
        'generated_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}