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
}
