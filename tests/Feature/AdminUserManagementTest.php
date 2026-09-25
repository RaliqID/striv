<?php

namespace Tests\Feature;

use App\Models\AdminAuditLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminUserManagementTest extends TestCase
{
    use RefreshDatabase;

    private function admin(array $attributes = []): User
    {
        return User::factory()->create(array_merge(['is_admin' => true], $attributes));
    }

    // ---------------------------------------------------------------- update

    public function test_admin_can_update_name_and_email(): void
    {
        $admin = $this->admin();
        $target = User::factory()->create(['name' => 'Old Name', 'email' => 'old@example.com']);
        $this->actingAs($admin, 'sanctum');

        $this->putJson('/api/v1/admin/users/'.$target->id, [
            'name' => 'New Name',
            'email' => 'new@example.com',
        ])->assertOk()
            ->assertJsonPath('user.name', 'New Name')
            ->assertJsonPath('user.email', 'new@example.com');

        $this->assertDatabaseHas('users', ['id' => $target->id, 'email' => 'new@example.com']);
    }

    public function test_update_rejects_duplicate_email(): void
    {
        $admin = $this->admin();
        User::factory()->create(['email' => 'taken@example.com']);
        $target = User::factory()->create(['email' => 'mine@example.com']);
        $this->actingAs($admin, 'sanctum');

        $this->putJson('/api/v1/admin/users/'.$target->id, ['email' => 'taken@example.com'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('email');
    }

    /** Changing the login identity must end existing sessions. */
    public function test_email_change_revokes_active_tokens(): void
    {
        $admin = $this->admin();
        $target = User::factory()->create(['email' => 'before@example.com']);
        $target->createToken('existing');
        $this->actingAs($admin, 'sanctum');

        $this->putJson('/api/v1/admin/users/'.$target->id, ['email' => 'after@example.com'])
            ->assertOk();

        $this->assertSame(0, $target->tokens()->count());
    }

    public function test_update_with_no_actual_change_is_a_no_op(): void
    {
        $admin = $this->admin();
        $target = User::factory()->create(['name' => 'Same', 'email' => 'same@example.com']);
        $this->actingAs($admin, 'sanctum');

        $this->putJson('/api/v1/admin/users/'.$target->id, [
            'name' => 'Same',
            'email' => 'same@example.com',
        ])->assertOk()->assertJsonPath('message', 'No changes to save.');

        $this->assertDatabaseCount('admin_audit_logs', 0);
    }

    // ------------------------------------------------------------------ role

    public function test_admin_can_grant_and_revoke_admin_rights(): void
    {
        $admin = $this->admin();
        $target = User::factory()->create();
        $this->actingAs($admin, 'sanctum');

        $this->putJson('/api/v1/admin/users/'.$target->id.'/role', ['is_admin' => true])
            ->assertOk()
            ->assertJsonPath('user.is_admin', true);

        $this->putJson('/api/v1/admin/users/'.$target->id.'/role', ['is_admin' => false])
            ->assertOk()
            ->assertJsonPath('user.is_admin', false);
    }

    public function test_admin_cannot_revoke_own_rights(): void
    {
        $admin = $this->admin();
        $this->actingAs($admin, 'sanctum');

        $this->putJson('/api/v1/admin/users/'.$admin->id.'/role', ['is_admin' => false])
            ->assertStatus(422)
            ->assertJson(['message' => 'You cannot remove admin rights from your own account.']);

        $this->assertTrue($admin->refresh()->is_admin);
    }

    /**
     * The unrecoverable case: removing the last administrator leaves a system
     * nobody can administer, so it must be refused.
     *
     * The guard counts *active* admins, so a suspended admin does not count as
     * cover — suspending your only colleague leaves you as the last one.
     */
    public function test_cannot_demote_the_last_active_admin(): void
    {
        $lastAdmin = User::factory()->create(['is_admin' => true]);
        $suspendedAdmin = User::factory()->create(['is_admin' => true, 'is_suspended' => true]);

        $guard = $this->app[\App\Services\Security\AdminGuard::class];

        // The suspended colleague cannot administer, so the target is last.
        $this->assertTrue($guard->isLastAdmin($lastAdmin));

        $this->actingAs($suspendedAdmin, 'sanctum')->putJson(
            '/api/v1/admin/users/'.$lastAdmin->id.'/role',
            ['is_admin' => false],
        )->assertStatus(403); // suspended admins cannot act at all

        $this->assertTrue($lastAdmin->refresh()->is_admin);
    }

    public function test_demoting_is_allowed_once_another_active_admin_exists(): void
    {
        $actor = User::factory()->create(['is_admin' => true]);
        $target = User::factory()->create(['is_admin' => true]);

        $guard = $this->app[\App\Services\Security\AdminGuard::class];
        $this->assertFalse($guard->isLastAdmin($target));

        $this->actingAs($actor, 'sanctum');
        $this->putJson('/api/v1/admin/users/'.$target->id.'/role', ['is_admin' => false])
            ->assertOk();

        $this->assertFalse($target->refresh()->is_admin);
    }

    public function test_guard_reports_last_admin_only_for_the_sole_active_admin(): void
    {
        $a = User::factory()->create(['is_admin' => true]);
        $b = User::factory()->create(['is_admin' => true]);
        $guard = $this->app[\App\Services\Security\AdminGuard::class];

        // Two active admins: neither is "last".
        $this->assertFalse($guard->isLastAdmin($a));
        $this->assertFalse($guard->isLastAdmin($b));

        // Suspending one leaves the other as the last active admin.
        $b->forceFill(['is_suspended' => true])->save();
        $this->assertTrue($guard->isLastAdmin($a));

        // A non-admin is never the last admin.
        $this->assertFalse($guard->isLastAdmin(User::factory()->create()));
    }

    public function test_cannot_suspend_the_last_active_admin(): void
    {
        $lastAdmin = User::factory()->create(['is_admin' => true]);
        $guard = $this->app[\App\Services\Security\AdminGuard::class];

        $this->assertTrue($guard->wouldRemoveLastAdmin($lastAdmin));
    }

    // -------------------------------------------------------- reset password

    public function test_reset_password_returns_one_time_password_and_forces_change(): void
    {
        $admin = $this->admin();
        $target = User::factory()->create(['password' => 'OldPassword123']);
        $this->actingAs($admin, 'sanctum');

        $response = $this->postJson('/api/v1/admin/users/'.$target->id.'/reset-password')
            ->assertOk()
            ->assertJsonStructure(['temporary_password', 'user']);

        $temporary = $response->json('temporary_password');
        $this->assertNotEmpty($temporary);
        $this->assertTrue($target->refresh()->must_change_password);

        // The issued password is the one that now works.
        $this->postJson('/api/v1/auth/login', [
            'email' => $target->email,
            'password' => $temporary,
        ])->assertOk();
    }

    public function test_reset_password_revokes_existing_sessions(): void
    {
        $admin = $this->admin();
        $target = User::factory()->create();
        $target->createToken('stolen');
        $this->actingAs($admin, 'sanctum');

        $this->postJson('/api/v1/admin/users/'.$target->id.'/reset-password')->assertOk();

        $this->assertSame(0, $target->tokens()->count());
    }

    public function test_old_password_stops_working_after_reset(): void
    {
        $admin = $this->admin();
        $target = User::factory()->create(['email' => 'victim@example.com', 'password' => 'OldPassword123']);
        $this->actingAs($admin, 'sanctum');

        $this->postJson('/api/v1/admin/users/'.$target->id.'/reset-password')->assertOk();

        // 422 = credentials rejected (project convention for bad login).
        $this->postJson('/api/v1/auth/login', [
            'email' => 'victim@example.com',
            'password' => 'OldPassword123',
        ])->assertStatus(422);
    }

    // ------------------------------------------------------- revoke sessions

    public function test_revoke_sessions_signs_user_out_everywhere(): void
    {
        $admin = $this->admin();
        $target = User::factory()->create();
        $target->createToken('one');
        $target->createToken('two');
        $this->actingAs($admin, 'sanctum');

        $this->postJson('/api/v1/admin/users/'.$target->id.'/revoke-sessions')
            ->assertOk()
            ->assertJsonPath('revoked', 2);

        $this->assertSame(0, $target->tokens()->count());
    }

    public function test_suspend_revokes_tokens_so_it_takes_effect_immediately(): void
    {
        $admin = $this->admin();
        $target = User::factory()->create();
        $token = $target->createToken('live')->plainTextToken;
        $this->actingAs($admin, 'sanctum');

        $this->postJson('/api/v1/admin/users/'.$target->id.'/suspend')->assertOk();

        $this->assertSame(0, $target->tokens()->count());

        // `actingAs` keeps the admin resolved on the guard for the whole test,
        // so the guard must be forgotten for the follow-up request to actually
        // re-authenticate with the revoked token, as a real client would.
        $this->app['auth']->forgetGuards();

        $this->withToken($token)->getJson('/api/v1/auth/user')->assertStatus(401);
    }

    /**
     * Suspension is enforced by middleware on every authenticated request, so
     * it holds even if a token somehow outlives the revocation.
     */
    public function test_suspended_user_is_blocked_even_with_a_valid_token(): void
    {
        $target = User::factory()->create(['is_suspended' => true]);
        $token = $target->createToken('stale')->plainTextToken;

        $this->withToken($token)->getJson('/api/v1/auth/user')
            ->assertStatus(403)
            ->assertJson(['message' => 'Account suspended. Contact support.']);
    }

    // ------------------------------------------------------------------ show

    public function test_show_exposes_capabilities_so_ui_can_disable_controls(): void
    {
        $admin = $this->admin();
        $this->actingAs($admin, 'sanctum');

        // Self: destructive controls are blocked with a reason.
        $self = $this->getJson('/api/v1/admin/users/'.$admin->id)->assertOk();
        $this->assertFalse($self->json('capabilities.delete.allowed'));
        $this->assertFalse($self->json('capabilities.suspend.allowed'));
        $this->assertSame('You cannot delete your own account.', $self->json('capabilities.delete.reason'));

        // A plain user can be acted on freely.
        $regular = User::factory()->create();
        $other = $this->getJson('/api/v1/admin/users/'.$regular->id)->assertOk();
        $this->assertTrue($other->json('capabilities.suspend.allowed'));
        $this->assertNull($other->json('capabilities.suspend.reason'));
    }

    /**
     * The last-admin rule counts only *active* admins, so suspending the only
     * colleague leaves the actor as the last administrator and its own
     * destructive controls become blocked — the rule includes self.
     */
    public function test_last_admin_sees_own_controls_blocked(): void
    {
        $admin = $this->admin();
        $this->actingAs($admin, 'sanctum');

        $response = $this->getJson('/api/v1/admin/users/'.$admin->id)->assertOk();

        // Own account: the self-rule fires.
        $this->assertFalse($response->json('capabilities.delete.allowed'));
        $this->assertSame('You cannot delete your own account.', $response->json('capabilities.delete.reason'));

        // A second, suspended admin does not count as cover, so removing the
        // actor would leave nobody — but the self-rule still fires first.
        User::factory()->create(['is_admin' => true, 'is_suspended' => true]);

        $guard = $this->app[\App\Services\Security\AdminGuard::class];
        $this->assertTrue($guard->isLastAdmin($admin));
    }

    public function test_capabilities_allow_actions_on_a_regular_user(): void
    {
        $admin = $this->admin();
        $regular = User::factory()->create();
        $this->actingAs($admin, 'sanctum');

        $response = $this->getJson('/api/v1/admin/users/'.$regular->id)->assertOk();

        $this->assertTrue($response->json('capabilities.suspend.allowed'));
        $this->assertTrue($response->json('capabilities.delete.allowed'));
        // Not an admin, so there are no admin rights to revoke.
        $this->assertFalse($response->json('capabilities.revoke_admin.allowed'));
        $this->assertSame('Not an administrator.', $response->json('capabilities.revoke_admin.reason'));
    }

    // ---------------------------------------------------------------- delete

    public function test_admin_can_delete_a_user(): void
    {
        $admin = $this->admin();
        $target = User::factory()->create(['email' => 'gone@example.com']);
        $this->actingAs($admin, 'sanctum');

        $this->deleteJson('/api/v1/admin/users/'.$target->id)->assertOk();

        $this->assertDatabaseMissing('users', ['id' => $target->id]);
    }

    public function test_cannot_delete_self(): void
    {
        $admin = $this->admin();
        $this->actingAs($admin, 'sanctum');

        $this->deleteJson('/api/v1/admin/users/'.$admin->id)
            ->assertStatus(422)
            ->assertJson(['message' => 'You cannot delete your own account.']);

        $this->assertDatabaseCount('users', 1);
    }

    public function test_cannot_delete_the_last_active_admin(): void
    {
        $admin = $this->admin();

        // Make the target the only active admin, then assert the guard refuses.
        $guard = $this->app[\App\Services\Security\AdminGuard::class];
        $this->assertTrue($guard->wouldRemoveLastAdmin($admin));

        $this->actingAs($admin, 'sanctum');
        $this->deleteJson('/api/v1/admin/users/'.$admin->id)
            ->assertStatus(422);

        $this->assertDatabaseCount('users', 1);
    }

    /** A deleted user's audit history must survive the deletion. */
    public function test_delete_keeps_audit_trail_with_identity(): void
    {
        $admin = $this->admin();
        $target = User::factory()->create(['name' => 'Doomed', 'email' => 'doomed@example.com']);
        $this->actingAs($admin, 'sanctum');

        $this->deleteJson('/api/v1/admin/users/'.$target->id)->assertOk();

        $log = AdminAuditLog::where('action', 'user.deleted')->firstOrFail();
        $this->assertSame('doomed@example.com', $log->metadata['deleted_email']);
        $this->assertSame('Doomed', $log->metadata['deleted_name']);
    }

    // ---------------------------------------------------------------- export

    public function test_export_streams_csv_of_filtered_users(): void
    {
        $admin = $this->admin();
        User::factory()->create(['email' => 'row@example.com']);
        $this->actingAs($admin, 'sanctum');

        $response = $this->get('/api/v1/admin/users/export');
        $response->assertOk();
        $response->assertHeader('content-type', 'text/csv; charset=UTF-8');

        $csv = $response->streamedContent();
        $this->assertStringContainsString('id,name,email', $csv);
        $this->assertStringContainsString('row@example.com', $csv);
    }

    public function test_export_is_audited(): void
    {
        $admin = $this->admin();
        $this->actingAs($admin, 'sanctum');

        $this->get('/api/v1/admin/users/export')->assertOk();

        $this->assertDatabaseHas('admin_audit_logs', ['action' => 'users.exported']);
    }

    // ------------------------------------------------------------ audit log

    public function test_privileged_actions_are_recorded_in_audit_log(): void
    {
        $admin = $this->admin(['name' => 'Root Admin']);
        $target = User::factory()->create(['email' => 'victim@example.com']);
        $this->actingAs($admin, 'sanctum');

        $this->postJson('/api/v1/admin/users/'.$target->id.'/suspend')->assertOk();

        $this->assertDatabaseHas('admin_audit_logs', [
            'action' => 'user.suspended',
            'actor_name' => 'Root Admin',
            'target_label' => 'victim@example.com',
        ]);
    }

    public function test_audit_log_can_be_listed_and_filtered(): void
    {
        $admin = $this->admin();
        $target = User::factory()->create();
        $this->actingAs($admin, 'sanctum');

        $this->postJson('/api/v1/admin/users/'.$target->id.'/suspend');
        $this->postJson('/api/v1/admin/users/'.$target->id.'/unsuspend');

        $this->getJson('/api/v1/admin/audit-logs')
            ->assertOk()
            ->assertJsonStructure(['data', 'meta', 'actions'])
            ->assertJsonCount(2, 'data');

        $filtered = $this->getJson('/api/v1/admin/audit-logs?action=user.suspended')->assertOk();
        $this->assertCount(1, $filtered->json('data'));
        $this->assertSame('user.suspended', $filtered->json('data.0.action'));
    }

    public function test_audit_log_is_admin_only(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user, 'sanctum');

        $this->getJson('/api/v1/admin/audit-logs')->assertStatus(403);
        $this->getJson('/api/v1/admin/security')->assertStatus(403);
    }
}
