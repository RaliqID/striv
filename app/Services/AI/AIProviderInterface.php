<?php

namespace App\Services\AI;

interface AIProviderInterface
{
    /**
     * Generate a structured training insight from the given context.
     *
     * @param array $context See InsightContextBuilder::build() for shape.
     * @return array|null    {title, summary, recommendation} on success, null on any failure.
     */
    public function generateInsight(array $context): ?array;

    /**
     * Send a conversation and get the raw reply.
     *
     * Declared on the interface because callers type against it. The reward
     * screen's coach line, the chat feature and the vision verifier all use
     * this, so leaving it off the interface meant every caller depended on a
     * method the contract did not promise.
     *
     * @param  array<int, array<string, mixed>>  $messages  OpenAI-style messages
     * @param  array<string, mixed>  $options               max_tokens, temperature
     * @return string|null  The reply text, or null on any failure.
     */
    public function chat(array $messages, array $options = []): ?string;
}
