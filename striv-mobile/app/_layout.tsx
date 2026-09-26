/**
 * Root layout.
 *
 * Owns the providers and the sign-in gate. The gate is expressed as a redirect
 * rather than conditional rendering so each screen stays a plain component and
 * the navigation stack stays consistent — a screen rendered outside the
 * navigator loses its header and back behaviour.
 */
import { useEffect } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AuthProvider, useAuth } from "../src/hooks/useAuth";
import { colors } from "../src/theme";

function AuthGate() {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    // Nothing to decide until the stored session has been restored; acting
    // earlier would bounce a signed-in user to login on every cold start.
    if (status === "unknown") return;

    const onLoginScreen = segments[0] === "login";

    if (status === "signedOut" && !onLoginScreen) {
      router.replace("/login");
    } else if (status === "signedIn" && onLoginScreen) {
      router.replace("/");
    }
  }, [status, segments, router]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="login" options={{ animation: "fade" }} />
      {/* Presented over the tab bar rather than inside it, so logging a set is
          full-screen without the nav competing for space. */}
      <Stack.Screen name="workout/[id]" options={{ animation: "slide_from_bottom" }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="dark" />
          <AuthGate />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
