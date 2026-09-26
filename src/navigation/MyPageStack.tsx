import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MyPageStackParamList } from './types';
import { MyPageScreen } from '../screens/mypage/MyPageScreen';
import { MyParticipationsScreen } from '../screens/mypage/MyParticipationsScreen';
import { BuildingManageScreen } from '../screens/mypage/BuildingManageScreen';
import { PaymentMethodsScreen } from '../screens/mypage/PaymentMethodsScreen';
import { SettlementScreen } from '../screens/mypage/SettlementScreen';
import { NotificationsScreen } from '../screens/notifications/NotificationsScreen';
import { AdminScreen } from '../screens/mypage/AdminScreen';
import { SubscriptionAdminScreen } from '../screens/mypage/SubscriptionAdminScreen';
import { OrderQueueScreen } from '../screens/mypage/OrderQueueScreen';
import { RestaurantSettlementScreen } from '../screens/mypage/RestaurantSettlementScreen';

const Stack = createNativeStackNavigator<MyPageStackParamList>();

export function MyPageStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MyPageHome" component={MyPageScreen} />
      <Stack.Screen name="MyParticipations" component={MyParticipationsScreen} />
      <Stack.Screen name="BuildingManage" component={BuildingManageScreen} />
      <Stack.Screen name="PaymentMethods" component={PaymentMethodsScreen} />
      <Stack.Screen name="Settlement" component={SettlementScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="Admin" component={AdminScreen} />
      <Stack.Screen name="SubscriptionAdmin" component={SubscriptionAdminScreen} />
      <Stack.Screen name="OrderQueue" component={OrderQueueScreen} />
      <Stack.Screen name="RestaurantSettlement" component={RestaurantSettlementScreen} />
    </Stack.Navigator>
  );
}
