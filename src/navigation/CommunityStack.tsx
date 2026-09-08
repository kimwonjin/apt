import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { CommunityStackParamList } from './types';
import { CommunityScreen } from '../screens/community/CommunityScreen';
import { CommunityWriteScreen } from '../screens/community/CommunityWriteScreen';
import { CommunityDetailScreen } from '../screens/community/CommunityDetailScreen';

const Stack = createNativeStackNavigator<CommunityStackParamList>();

export function CommunityStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="CommunityFeed" component={CommunityScreen} />
      <Stack.Screen name="CommunityWrite" component={CommunityWriteScreen} />
      <Stack.Screen name="CommunityDetail" component={CommunityDetailScreen} />
    </Stack.Navigator>
  );
}
