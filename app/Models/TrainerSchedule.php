<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One training day in a client's weekly schedule.
 *
 * Flat rows rather than a JSON blob: the client screen renders a simple list,
 * and a trainer editing Tuesday touches only Tuesday's row.
 */
class TrainerSchedule extends Model
{
    use HasFactory;

    /** ISO-8601 day numbers, 1 = Monday … 7 = Sunday. */
    public const DAY_NAMES = [
        1 => 'Monday',
        2 => 'Tuesday',
        3 => 'Wednesday',
        4 => 'Thursday',
        5 => 'Friday',
        6 => 'Saturday',
        7 => 'Sunday',
    ];

    protected $fillable = [
        'trainer_assignment_id',
        'day_of_week',
        'time_slot',
        'focus',
        'proposed_by',
        'notes',
        'confirmed_at',
        'member_response',
        'member_responded_at',
    ];

    protected $casts = [
        'day_of_week' => 'integer',
        'confirmed_at' => 'datetime',
        'member_responded_at' => 'datetime',
    ];

    public function assignment(): BelongsTo
    {
        return $this->belongsTo(TrainerAssignment::class, 'trainer_assignment_id');
    }

    public function dayName(): string
    {
        return self::DAY_NAMES[$this->day_of_week] ?? 'Unknown';
    }

    /** True when the member has not yet answered a trainer's proposal. */
    public function awaitsMemberResponse(): bool
    {
        return $this->proposed_by === 'trainer' && $this->member_response === null;
    }
}
