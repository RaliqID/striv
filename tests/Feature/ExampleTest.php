<?php

namespace Tests\Feature;

use Tests\TestCase;

class RootRouteTest extends TestCase
{
    /**
     * Striv is a headless API behind a Next.js client, so the API host's root
     * exists only to send visitors somewhere useful. With a frontend URL
     * configured that is a redirect; without one it reports API status rather
     * than rendering a framework placeholder page.
     */
    public function test_root_redirects_to_the_configured_frontend(): void
    {
        config(['app.frontend_url' => 'https://app.example.com']);

        $this->get('/')->assertRedirect('https://app.example.com');
    }

    public function test_root_reports_api_status_when_no_frontend_is_configured(): void
    {
        config(['app.frontend_url' => null]);

        $this->get('/')
            ->assertOk()
            ->assertJsonPath('status', 'ok')
            ->assertJsonPath('name', 'Striv API');
    }
}
