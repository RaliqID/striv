<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Http\Middleware\SetLocale;
use Illuminate\Http\Request;

/**
 * Language preference.
 *
 * Deliberately separate from the profile endpoint: language is an interface
 * preference, not training data, and conflating them would mean an onboarding
 * form save could silently reset someone's language.
 */
class LocaleController extends Controller
{
    /** The available languages, for the switcher to render itself. */
    public function index(Request $request)
    {
        return response()->json([
            'current' => $request->user()?->locale ?? SetLocale::DEFAULT,
            'available' => [
                ['code' => 'en', 'label' => 'English', 'native' => 'English'],
                ['code' => 'id', 'label' => 'Indonesian', 'native' => 'Bahasa Indonesia'],
            ],
        ]);
    }

    /**
     * Save the chosen language.
     *
     * Returns the localized confirmation in the newly-selected language, so the
     * client can show immediate proof the switch took effect.
     */
    public function update(Request $request)
    {
        $validated = $request->validate([
            'locale' => ['required', 'string', 'in:'.implode(',', User::SUPPORTED_LOCALES)],
        ]);

        $user = $request->user();
        $user->forceFill(['locale' => $validated['locale']])->save();

        // Render the response itself in the new language rather than relying on
        // the next request to pick it up.
        app()->setLocale($validated['locale']);

        return response()->json([
            'locale' => $user->locale,
            'message' => __('messages.locale.updated'),
        ]);
    }
}
