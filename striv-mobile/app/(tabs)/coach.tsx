/**
 * AI coach chat.
 *
 * Conversations are per-session on the backend, so the screen has two states:
 * a session list and an open conversation. Modelled as one screen with local
 * state rather than two routes, because switching back and forth is frequent and
 * a route change would throw away the scroll position.
 *
 * An optimistic user bubble is appended before the request resolves. The AI
 * reply is slow (a model call), and a chat that sits silent for several seconds
 * after you press send feels broken.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { chat } from "../../src/api/endpoints";
import type { ChatMessage, ChatSession } from "../../src/api/types";
import { Badge, Button, Card, EmptyState, ErrorState, LoadingState } from "../../src/components/ui";
import { colors, HIT_SLOP, radius, spacing, typography } from "../../src/theme";

type Bubble = ChatMessage & { pending?: boolean };

const SUGGESTIONS = [
  "How is my training going?",
  "What should I focus on this week?",
  "Am I making progress on my goals?",
];

export default function CoachScreen() {
  const insets = useSafeAreaInsets();

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSession, setActiveSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<Bubble[]>([]);

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const listRef = useRef<FlatList<Bubble>>(null);

  const loadSessions = useCallback(async () => {
    setError(null);
    try {
      const response = await chat.sessions();
      setSessions(response.sessions ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load your conversations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const openSession = async (session: ChatSession) => {
    setActiveSession(session);
    setMessages([]);
    try {
      const history = await chat.history(session.id);
      setMessages(history.messages ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not open that conversation.");
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;

    setDraft("");
    setSending(true);
    setError(null);

    // Optimistic bubble so the message appears the instant it is sent.
    const optimistic: Bubble = {
      id: -Date.now(),
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
      pending: true,
    };
    setMessages((current) => [...current, optimistic]);

    try {
      const response = await chat.send(text, activeSession ? activeSession.id || undefined : undefined);

      // The API returns both sides of the exchange, so the optimistic bubble is
      // replaced with the server's copy and the reply appended directly — no
      // follow-up history fetch.
      setMessages((current) => [
        ...current.filter((message) => message.id !== optimistic.id),
        response.user_message,
        response.assistant_message,
      ]);

      // A first message creates a session server-side; adopt it so the next
      // send continues the same conversation instead of starting another.
      setActiveSession(response.session);
      void loadSessions();
    } catch (caught) {
      // Drop the optimistic bubble: it was never saved, so leaving it would
      // imply the message went through.
      setMessages((current) => current.filter((message) => message.id !== optimistic.id));
      setError(caught instanceof Error ? caught.message : "Could not send that message.");
      setDraft(text);
    } finally {
      setSending(false);
    }
  };

  const backToList = () => {
    setActiveSession(null);
    setMessages([]);
    void loadSessions();
  };

  /* --------------------------------------------------------- conversation */

  if (activeSession !== null) {
    return (
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <View style={styles.headerText}>
            <Text style={styles.title} numberOfLines={1}>
              {activeSession.title || "Coach"}
            </Text>
            <Text style={styles.subtitle}>Your AI training coach</Text>
          </View>
          <Button label="Back" variant="ghost" onPress={backToList} />
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item, index) => `${item.id}-${index}`}
          contentContainerStyle={styles.messages}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => {
            const isUser = item.role === "user";
            return (
              <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAssistant]}>
                <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
                  <Text style={isUser ? styles.bubbleTextUser : styles.bubbleTextAssistant}>
                    {item.content}
                  </Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            sending ? null : (
              <EmptyState title="Say hello" description="Ask about your training, progress, or what to do next." />
            )
          }
          ListFooterComponent={
            sending ? (
              <View style={styles.thinking}>
                <ActivityIndicator size="small" color={colors.textMuted} />
                <Text style={styles.thinkingText}>Coach is thinking…</Text>
              </View>
            ) : null
          }
        />

        {error ? (
          <View style={styles.errorBar}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={[styles.composer, { paddingBottom: insets.bottom + spacing.md }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Ask your coach…"
            placeholderTextColor={colors.textFaint}
            multiline
            maxLength={2000}
            editable={!sending}
            style={styles.composerInput}
          />
          <Pressable
            onPress={() => void send()}
            disabled={!draft.trim() || sending}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            style={({ pressed }) => [
              styles.sendButton,
              (!draft.trim() || sending) && styles.sendButtonDisabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.sendLabel}>Send</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    );
  }

  /* -------------------------------------------------------- session list */

  return (
    <View style={[styles.screen, { paddingTop: insets.top + spacing.lg }]}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Coach</Text>
          <Text style={styles.subtitle}>Ask about your training and progress</Text>
        </View>
      </View>

      {loading ? (
        <LoadingState label="Loading conversations" />
      ) : error ? (
        <View style={styles.padded}>
          <ErrorState message={error} onRetry={() => void loadSessions()} />
        </View>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <>
              <Button
                label="Start a new chat"
                onPress={() => {
                  setActiveSession({ id: 0, title: null, last_message_at: null });
                  setMessages([]);
                }}
                style={styles.newChat}
              />

              <Card style={styles.suggestions}>
                <Text style={styles.suggestionsTitle}>Try asking</Text>
                {SUGGESTIONS.map((suggestion) => (
                  <Pressable
                    key={suggestion}
                    onPress={() => {
                      setActiveSession({ id: 0, title: null, last_message_at: null });
                      setMessages([]);
                      setDraft(suggestion);
                    }}
                    style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}
                    accessibilityRole="button"
                  >
                    <Text style={styles.suggestionText}>{suggestion}</Text>
                  </Pressable>
                ))}
              </Card>

              {sessions.length > 0 ? <Text style={styles.sectionLabel}>RECENT</Text> : null}
            </>
          }
          ListEmptyComponent={
            <Card>
              <EmptyState
                title="No conversations yet"
                description="Start a chat and ask your coach anything about your training."
              />
            </Card>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => void openSession(item)}
              accessibilityRole="button"
              style={({ pressed }) => [pressed && styles.pressed]}
            >
              <Card>
                <View style={styles.sessionRow}>
                  <View style={styles.sessionText}>
                    <Text style={styles.sessionTitle} numberOfLines={1}>
                      {item.title || `Conversation ${item.id}`}
                    </Text>
                    <Text style={styles.sessionMeta}>
                      {item.last_message_at
                        ? new Date(item.last_message_at).toLocaleDateString(undefined, {
                            day: "numeric",
                            month: "short",
                          })
                        : "—"}
                    </Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </View>
              </Card>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  padded: { paddingHorizontal: spacing.lg },

  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  headerText: { flex: 1 },
  title: { ...typography.title, color: colors.text },
  subtitle: { ...typography.body, color: colors.textMuted, marginTop: 2 },

  list: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  newChat: { marginBottom: spacing.md },
  sectionLabel: { ...typography.caps, color: colors.textFaint, marginTop: spacing.sm },

  suggestions: { marginBottom: spacing.md, gap: spacing.xs },
  suggestionsTitle: { ...typography.caps, color: colors.textFaint, marginBottom: spacing.xs },
  suggestion: { paddingVertical: spacing.md, minHeight: 44, justifyContent: "center" },
  suggestionText: { ...typography.body, color: colors.accent },

  sessionRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  sessionText: { flex: 1 },
  sessionTitle: { ...typography.bodyStrong, color: colors.text },
  sessionMeta: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  chevron: { fontSize: 26, color: colors.textFaint, lineHeight: 28 },

  messages: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.md },
  bubbleRow: { flexDirection: "row" },
  bubbleRowUser: { justifyContent: "flex-end" },
  bubbleRowAssistant: { justifyContent: "flex-start" },
  bubble: {
    maxWidth: "85%",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
  },
  bubbleUser: { backgroundColor: colors.primary, borderBottomRightRadius: radius.sm },
  bubbleAssistant: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    borderBottomLeftRadius: radius.sm,
  },
  bubbleTextUser: { ...typography.body, color: colors.onPrimary },
  bubbleTextAssistant: { ...typography.body, color: colors.text },

  thinking: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  thinkingText: { ...typography.caption, color: colors.textMuted },

  errorBar: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft,
  },
  errorText: { ...typography.caption, color: colors.onDangerSoft },

  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
    backgroundColor: colors.surface,
  },
  composerInput: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
    ...typography.body,
    color: colors.text,
  },
  sendButton: {
    minHeight: 48,
    minWidth: 72,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: { opacity: 0.4 },
  sendLabel: { ...typography.bodyStrong, color: colors.onPrimary },
  pressed: { opacity: 0.7 },
});
