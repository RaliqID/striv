<?php

return [
    /*
     * Badge catalogue.
     *
     * Keyed by a stable machine key that code and the database both use. The
     * `name_key` and `description_key` are i18n keys, NOT English copy — the
     * same badge appears on the achievements page, the level-up screen and the
     * ledger, and storing literal text would pin it to one language.
     *
     * `criteria` describes how it unlocks and is read by AchievementService;
     * keeping the threshold in the catalogue means a new tier is a one-line
     * addition rather than a new code path.
     */
    'badges' => [
        [
            'key' => 'first_session',
            'name_key' => 'achievements.firstSession',
            'description_key' => 'achievements.firstSessionDesc',
            'icon' => 'fitness_center',
            'category' => 'milestone',
            'xp_reward' => 25,
            'sort_order' => 1,
            'criteria' => ['type' => 'sessions', 'threshold' => 1],
        ],
        [
            'key' => 'ten_sessions',
            'name_key' => 'achievements.tenSessions',
            'description_key' => 'achievements.tenSessionsDesc',
            'icon' => 'military_tech',
            'category' => 'milestone',
            'xp_reward' => 50,
            'sort_order' => 2,
            'criteria' => ['type' => 'sessions', 'threshold' => 10],
        ],
        [
            'key' => 'fifty_sessions',
            'name_key' => 'achievements.fiftySessions',
            'description_key' => 'achievements.fiftySessionsDesc',
            'icon' => 'workspace_premium',
            'category' => 'milestone',
            'xp_reward' => 150,
            'sort_order' => 3,
            'criteria' => ['type' => 'sessions', 'threshold' => 50],
        ],
        [
            'key' => 'hundred_sessions',
            'name_key' => 'achievements.hundredSessions',
            'description_key' => 'achievements.hundredSessionsDesc',
            'icon' => 'emoji_events',
            'category' => 'milestone',
            'xp_reward' => 300,
            'sort_order' => 4,
            'criteria' => ['type' => 'sessions', 'threshold' => 100],
        ],

        [
            'key' => 'streak_2',
            'name_key' => 'achievements.streak2',
            'description_key' => 'achievements.streak2Desc',
            'icon' => 'local_fire_department',
            'category' => 'streak',
            'xp_reward' => 30,
            'sort_order' => 10,
            'criteria' => ['type' => 'streak', 'threshold' => 2],
        ],
        [
            'key' => 'streak_4',
            'name_key' => 'achievements.streak4',
            'description_key' => 'achievements.streak4Desc',
            'icon' => 'whatshot',
            'category' => 'streak',
            'xp_reward' => 75,
            'sort_order' => 11,
            'criteria' => ['type' => 'streak', 'threshold' => 4],
        ],
        [
            'key' => 'streak_8',
            'name_key' => 'achievements.streak8',
            'description_key' => 'achievements.streak8Desc',
            'icon' => 'bolt',
            'category' => 'streak',
            'xp_reward' => 150,
            'sort_order' => 12,
            'criteria' => ['type' => 'streak', 'threshold' => 8],
        ],
        [
            'key' => 'streak_12',
            'name_key' => 'achievements.streak12',
            'description_key' => 'achievements.streak12Desc',
            'icon' => 'flash_on',
            'category' => 'streak',
            'xp_reward' => 250,
            'sort_order' => 13,
            'criteria' => ['type' => 'streak', 'threshold' => 12],
        ],

        [
            'key' => 'first_pr',
            'name_key' => 'achievements.firstPr',
            'description_key' => 'achievements.firstPrDesc',
            'icon' => 'trending_up',
            'category' => 'strength',
            'xp_reward' => 50,
            'sort_order' => 20,
            'criteria' => ['type' => 'prs', 'threshold' => 1],
        ],
        [
            'key' => 'ten_prs',
            'name_key' => 'achievements.tenPrs',
            'description_key' => 'achievements.tenPrsDesc',
            'icon' => 'stacked_line_chart',
            'category' => 'strength',
            'xp_reward' => 125,
            'sort_order' => 21,
            'criteria' => ['type' => 'prs', 'threshold' => 10],
        ],
        [
            'key' => 'twentyfive_prs',
            'name_key' => 'achievements.twentyFivePrs',
            'description_key' => 'achievements.twentyFivePrsDesc',
            'icon' => 'rocket_launch',
            'category' => 'strength',
            'xp_reward' => 300,
            'sort_order' => 22,
            'criteria' => ['type' => 'prs', 'threshold' => 25],
        ],

        [
            'key' => 'perfect_month',
            'name_key' => 'achievements.perfectMonth',
            'description_key' => 'achievements.perfectMonthDesc',
            'icon' => 'calendar_month',
            'category' => 'consistency',
            'xp_reward' => 200,
            'sort_order' => 30,
            'criteria' => ['type' => 'sessions_in_month', 'threshold' => 12],
        ],
        [
            'key' => 'photo_evidence_10',
            'name_key' => 'achievements.photoTen',
            'description_key' => 'achievements.photoTenDesc',
            'icon' => 'photo_camera',
            'category' => 'consistency',
            'xp_reward' => 100,
            'sort_order' => 31,
            'criteria' => ['type' => 'proven_sets', 'threshold' => 10],
        ],
        [
            'key' => 'coach_program_complete',
            'name_key' => 'achievements.programComplete',
            'description_key' => 'achievements.programCompleteDesc',
            'icon' => 'assignment_turned_in',
            'category' => 'consistency',
            'xp_reward' => 175,
            'sort_order' => 32,
            'criteria' => ['type' => 'program_weeks', 'threshold' => 4],
        ],
    ],
];
