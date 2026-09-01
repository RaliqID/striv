<?php

namespace App\Jobs;

use App\Models\User;
use App\Services\AI\AIInsightService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class GenerateInsight implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 2;
    public int $backoff = 60;

    public function __construct(public int $userId)
    {
    }

    public function handle(AIInsightService $service): void
    {
        try {
            $user = User::find($this->userId);
            if (!$user) {
                Log::warning('GenerateInsight: user not found', ['user_id' => $this->userId]);
                return;
            }
            $service->generateAndPersist($user);
        } catch (\Throwable $e) {
            Log::error('GenerateInsight job failed', [
                'user_id' => $this->userId,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
