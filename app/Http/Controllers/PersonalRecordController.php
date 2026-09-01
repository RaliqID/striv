<?php

namespace App\Http\Controllers;

use App\Models\Exercise;
use App\Models\PersonalRecord;
use Illuminate\Http\Request;

class PersonalRecordController extends Controller
{
    public function index(Request $request)
    {
        $query = PersonalRecord::where('user_id', $request->user()->id)
            ->with('exercise')
            ->orderBy('achieved_at', 'desc');

        if ($request->filled('exercise')) {
            $slug = $request->input('exercise');
            $query->whereHas('exercise', fn ($q) => $q->where('slug', $slug));
        }

        return response()->json($query->paginate(20));
    }

    public function show(Request $request, string $slug)
    {
        $exercise = Exercise::where('slug', $slug)->firstOrFail();

        $records = PersonalRecord::where('user_id', $request->user()->id)
            ->where('exercise_id', $exercise->id)
            ->with('exercise')
            ->orderBy('achieved_at', 'desc')
            ->get();

        return response()->json($records);
    }
}