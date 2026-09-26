/**
 * Progress.
 *
 * Charts are drawn with Views rather than a charting library. The two shapes
 * needed here are a bar series and a line, both of which are a handful of
 * absolutely-positioned Views — pulling in a charting dependency for that would
 * add a large surface for no gain, and this renders instantly with no SVG layer.
 *
 * Every series tolerates being empty: a new account has no history, and an
 * empty chart frame reads as broken, so each one has an explicit empty state.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { analytics, type ProgressResponse } from "../../src/api/endpoints";
import { Card, EmptyState, ErrorState, LoadingState, SectionTitle } from "../../src/components/ui";
import { colors, radius, spacing, typography } from "../../src/theme";

const CHART_HEIGHT = 140;

function formatVolume(value: number | null | undefined): string {
  if (value == null) return "—";
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(Math.round(value));
}

/** Simple bar chart. Bars are flex-sized so the series fills any width. */
function BarChart({ data }: { data: Array<{ label: string; value: number }> }) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <View>
      <View style={styles.chartRow}>
        {data.map((point, index) => {
          const heightPct = Math.max((point.value / max) * 100, 3);
          return (
            <View key={`${point.label}-${index}`} style={styles.barColumn}>
              <View style={styles.barTrack}>
                <View style={[styles.bar, { height: `${heightPct}%` }]} />
              </View>
              <Text style={styles.axisLabel} numberOfLines={1}>
                {point.label}
              </Text>
            </View>
          );
        })}
      </View>
      <View style={styles.chartFooter}>
        <Text style={styles.chartMeta}>Peak {formatVolume(max)} kg</Text>
      </View>
    </View>
  );
}

/**
 * Line chart from a series of values.
 *
 * Implemented as a row of thin segments: each segment's vertical offset comes
 * from interpolating between consecutive points, which approximates a line
 * without needing paths or SVG.
 */
function LineChart({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;

  return (
    <View style={styles.lineChart}>
      {values.slice(1).map((value, index) => {
        const previous = values[index];
        const from = ((previous - min) / span) * CHART_HEIGHT;
        const to = ((value - min) / span) * CHART_HEIGHT;

        // Normalise both ends into a 0-100% box, then draw a fixed-height
        // segment rotated by the slope between them.
        const leftPct = (index / (values.length - 1)) * 100;
        const rightPct = ((index + 1) / (values.length - 1)) * 100;
        const midPct = (leftPct + rightPct) / 2;
        const midY = (from + to) / 2;
        const deltaY = to - from;
        const deltaX = rightPct - leftPct;

        const widthPct = Math.abs(deltaX) + 1.5;
        const angle = (Math.atan2(deltaY, deltaX) * 180) / Math.PI;
        const length = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        const heightPx = Math.max(length * (CHART_HEIGHT / 100), 2);

        return (
          <View
            key={index}
            style={[
              styles.lineSegment,
              {
                left: `${midPct - widthPct / 2}%`,
                bottom: CHART_HEIGHT - midY - heightPx / 2,
                width: `${widthPct}%`,
                height: heightPx,
                transform: [{ rotate: `${-angle}deg` }],
              },
            ]}
          />
        );
      })}
      <View style={styles.lineBaseline} />
    </View>
  );
}

export default function ProgressScreen() {
  const insets = useSafeAreaInsets();

  const [data, setData] = useState<ProgressResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    setError(null);
    try {
      setData(await analytics.progress());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load your progress.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <LoadingState label="Loading progress" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.screen, styles.center, { paddingHorizontal: spacing.lg }]}>
        <ErrorState message={error} onRetry={() => void load()} />
      </View>
    );
  }

  const volumeSeries = (data?.volume_series ?? []).slice(-8);
  const e1rmSeries = (data?.e1rm_series ?? []).slice(-16);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.lg, paddingBottom: spacing.xxxl },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load(true);
          }}
          tintColor={colors.text}
        />
      }
    >
      <Text style={styles.title}>Progress</Text>
      <Text style={styles.subtitle}>How your training is trending.</Text>

      <View style={styles.section}>
        <SectionTitle>Weekly volume</SectionTitle>
        <Card>
          {volumeSeries.length > 0 ? (
            <BarChart
              data={volumeSeries.map((point) => ({
                label: new Date(point.week_start).toLocaleDateString(undefined, {
                  day: "numeric",
                  month: "short",
                }),
                value: point.volume_kg ?? 0,
              }))}
            />
          ) : (
            <EmptyState title="No volume data yet" description="Log a few workouts to see the trend." />
          )}
        </Card>
      </View>

      <View style={styles.section}>
        <SectionTitle>Estimated 1RM</SectionTitle>
        <Card>
          {e1rmSeries.length >= 2 ? (
            <>
              <LineChart values={e1rmSeries.map((point) => point.e1rm)} />
              <View style={styles.legendRow}>
                <Text style={styles.chartMeta}>
                  {Math.round(e1rmSeries[0].e1rm)} kg → {Math.round(e1rmSeries[e1rmSeries.length - 1].e1rm)} kg
                </Text>
                {e1rmSeries[0].exercise_name ? (
                  <Text style={styles.chartMeta}>{e1rmSeries[0].exercise_name}</Text>
                ) : null}
              </View>
            </>
          ) : (
            <EmptyState
              title="Not enough data"
              description="At least two logged sessions are needed to draw a trend."
            />
          )}
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: spacing.lg, gap: spacing.xl },

  title: { ...typography.title, color: colors.text },
  subtitle: { ...typography.body, color: colors.textMuted, marginTop: -spacing.md },

  section: { gap: spacing.sm },

  chartRow: { flexDirection: "row", alignItems: "flex-end", height: CHART_HEIGHT + 24, gap: 4 },
  barColumn: { flex: 1, alignItems: "center", height: CHART_HEIGHT + 24 },
  barTrack: { flex: 1, width: "100%", justifyContent: "flex-end" },
  bar: { width: "100%", backgroundColor: colors.accent, borderRadius: radius.sm, minHeight: 3 },
  axisLabel: { ...typography.caption, color: colors.textFaint, marginTop: spacing.xs, fontSize: 10 },
  chartFooter: { marginTop: spacing.sm },
  chartMeta: { ...typography.caption, color: colors.textMuted },

  lineChart: { height: CHART_HEIGHT, justifyContent: "flex-end", overflow: "hidden" },
  lineSegment: {
    position: "absolute",
    backgroundColor: colors.primary,
    borderRadius: 2,
  },
  lineBaseline: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 1,
    backgroundColor: colors.outlineVariant,
  },
  legendRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.md,
  },
});
