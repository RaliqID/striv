<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProgressSnapshot extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'date',
        'volume_total',
        'volume_weekly',
        'frequency_weekly',
        'consistency_score',
    ];

    protected $casts = [
        'date' => 'date',
        'volume_total' => 'float',
        'volume_weekly' => 'float',
        'frequency_weekly' => 'integer',
        'consistency_score' => 'float',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}