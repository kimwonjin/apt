import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { useAppState } from '../state/AppStateContext';
import { OnboardingScreen } from '../screens/onboarding/OnboardingScreen';
import { MainTabs } from './MainTabs';
import { colors } from '../theme';

export function RootNavigator() {
  const { bootstrapping, verificationStatus } = useAppState();

  if (bootstrapping) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {verificationStatus === 'verified' ? <MainTabs /> : <OnboardingScreen />}
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
});
