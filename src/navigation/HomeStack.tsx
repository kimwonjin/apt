import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeStackParamList } from './types';
import { HomeScreen } from '../screens/home/HomeScreen';
import { GroupBuyDetailScreen } from '../screens/groupbuy/GroupBuyDetailScreen';
import { GroupBuyCreateScreen } from '../screens/groupbuy/GroupBuyCreateScreen';
import { NotificationsScreen } from '../screens/notifications/NotificationsScreen';

const Stack = createNativeStackNavigator<HomeStackParamList>();

export function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="HomeList" component={HomeScreen} />
      <Stack.Screen name="GroupBuyDetail" component={GroupBuyDetailScreen} />
      <Stack.Screen name="GroupBuyCreate" component={GroupBuyCreateScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
    </Stack.Navigator>
  );
}
