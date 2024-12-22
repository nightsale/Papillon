import Router from "@/router";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { LogBox, AppState, AppStateStatus } from "react-native";
import React, { useEffect, useState, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCurrentAccount } from "@/stores/account";
import { AccountService } from "@/stores/account/types";
import { log } from "@/utils/logger/logger";
import { expoGoWrapper } from "@/utils/native/expoGoAlert";
import { atobPolyfill, btoaPolyfill } from "js-base64";

SplashScreen.preventAutoHideAsync();

const BACKGROUND_LIMITS: Record<AccountService | "DEFAULT", number> = {
  [AccountService.EcoleDirecte]: 300000, // 5 minutes
  [AccountService.Pronote]: 7000, // 5 minutes
  [AccountService.Skolengo]: 43200000, // 12 heures
  DEFAULT: 900000,
  // Obliger de mettre 0 pour les services non gérés pour éviter les erreurs de type
  [AccountService.Local]: 0,
  [AccountService.WebResto]: 0,
  [AccountService.Turboself]: 0,
  [AccountService.ARD]: 0,
  [AccountService.Parcoursup]: 0,
  [AccountService.Onisep]: 0,
  [AccountService.Multi]: 0,
  [AccountService.Izly]: 0,
  [AccountService.Alise]: 0
};

export default function App () {
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const backgroundStartTime = useRef<number | null>(null);
  const hasHandledBackground = useRef<boolean>(false);
  const switchTo = useCurrentAccount((store) => store.switchTo);
  const currentAccount = useCurrentAccount((store) => store.account);

  const [fontsLoaded, fontError] = useFonts({
    light: require("./assets/fonts/FixelText-Light.ttf"),
    regular: require("./assets/fonts/FixelText-Regular.ttf"),
    medium: require("./assets/fonts/FixelText-Medium.ttf"),
    semibold: require("./assets/fonts/FixelText-SemiBold.ttf"),
    bold: require("./assets/fonts/FixelText-Bold.ttf"),
  });

  const getBackgroundTimeLimit = (service: AccountService | undefined): number => {
    console.log("Service:", service);
    console.log("Available limits:", BACKGROUND_LIMITS);
    if (!service) {
      console.log("No service, returning default:", BACKGROUND_LIMITS.DEFAULT);
      return BACKGROUND_LIMITS.DEFAULT;
    }
    const limit = BACKGROUND_LIMITS[service] || BACKGROUND_LIMITS.DEFAULT;
    console.log("Returning limit:", limit);
    return limit;
  };

  const handleBackgroundState = async () => {
    try {
      if (!backgroundStartTime.current) return;
      if (!currentAccount) {
        log( "⚠️ No current account found", "RefreshToken",);
        return;
      }

      const timeInBackground = Date.now() - backgroundStartTime.current;
      const timeLimit = getBackgroundTimeLimit(currentAccount.service);

      log(`Time in background: ${Math.floor(timeInBackground / 1000)}s`, "RefreshToken");
      log(`Time limit: ${timeLimit / 1000}s`, "RefreshToken");
      log(`Account type: ${currentAccount.service}`, "RefreshToken");
      log(`Account service time: ${BACKGROUND_LIMITS[currentAccount.service] / 1000}s`, "RefreshToken");

      if (timeInBackground >= timeLimit && !hasHandledBackground.current) {
        log(`⚠️ Application in background for ${timeLimit / 60000} minutes!`, "RefreshToken");
        switchTo(currentAccount);

        await AsyncStorage.setItem("@background_timestamp", Date.now().toString());
        hasHandledBackground.current = true;
      }
    } catch (error) {
      log(`Error handling background state: ${error}`, "RefreshToken");
    }
  };

  const handleAppStateChange = (nextAppState: AppStateStatus) => {
    setAppState(prevState => {
      if (prevState === nextAppState) return prevState;

      if (nextAppState === "active") {
        log("🔄 App is active", "AppState");
        handleBackgroundState();
        backgroundStartTime.current = null;
        hasHandledBackground.current = false;
      } else if (nextAppState.match(/inactive|background/)) {
        log("⏱️ App in background", "AppState");
        backgroundStartTime.current = Date.now();
      }

      return nextAppState;
    });
  };

  const applyGlobalPolyfills = () => {
    const encoding = require("text-encoding");
    Object.assign(global, {
      TextDecoder: encoding.TextDecoder,
      TextEncoder: encoding.TextEncoder,
      atob: atobPolyfill,
      btoa: btoaPolyfill
    });
  };

  applyGlobalPolyfills();

  useEffect(() => {
    const subscription = AppState.addEventListener("change", handleAppStateChange);

    LogBox.ignoreLogs([
      "[react-native-gesture-handler]",
      "VirtualizedLists should never be nested",
      "TNodeChildrenRenderer: Support for defaultProps"
    ]);

    expoGoWrapper(async () => {
      const { registerBackgroundTasks } = await import("@/background/BackgroundTasks");
      registerBackgroundTasks();
    });

    return () => subscription.remove();
  }, []);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return <Router />;
}