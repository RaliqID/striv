<?php

namespace App\Http\Controllers;

use App\Models\Exercise;
use App\Models\MuscleGroup;
use Illuminate\Http\Request;

class ExerciseController extends Controller
{
    public function index(Request $request)
    {
        $query = Exercise::with('muscleGroups');

        if ($request->filled('search')) {
            $query->where('name', 'like', '%' . $request->input('search') . '%');
        }

        if ($request->filled('muscle')) {
            $query->whereHas('muscleGroups', function ($q) use ($request) {
                $q->where('slug', $request->input('muscle'));
            });
        }

        if ($request->filled('equipment')) {
            $query->where('equipment', $request->input('equipment'));
        }

        return response()->json($query->paginate(24));
    }

    public function show(string $slug)
    {
        $exercise = Exercise::where('slug', $slug)->with('muscleGroups')->firstOrFail();

        return response()->json($exercise);
    }
}
