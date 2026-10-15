<?php

namespace App\Http\Controllers;

use App\Services\Training\TodayPlanService;
use Illuminate\Http\Request;

/**
 * "What am I doing today?"
 *
 * One endpoint that the workout lobby calls on load. It removes the decision
 * from the member: their trainer (or the generator acting for them) already
 * decided the session, so the screen opens with the plan filled in and the
 * member only has to log the numbers.
 */
class TodayPlanController extends Controller
{
    public function __construct(private readonly TodayPlanService $plans)
    {
    }

    public function show(Request $request)
    {
        return response()->json(
            $this->plans->forUser($request->user())
        );
    }
}
