import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SubscriptionStackParamList } from './types';
import { SubscriptionListScreen } from '../screens/subscription/SubscriptionListScreen';

const Stack = createNativeStackNavigator<SubscriptionStackParamList>();

export function SubscriptionStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SubscriptionList" component={SubscriptionListScreen} />
    </Stack.Navigator>
  );
}
