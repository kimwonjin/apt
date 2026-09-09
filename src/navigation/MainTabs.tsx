import React from 'react';
import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute, RouteProp } from '@react-navigation/native';
import { MainTabParamList } from './types';
import { HomeStack } from './HomeStack';
import { ChatStack } from './ChatStack';
import { SubscriptionStack } from './SubscriptionStack';
import { MyPageStack } from './MyPageStack';
import { colors } from '../theme';

const Tab = createBottomTabNavigator<MainTabParamList>();

const TAB_ICON: Record<keyof MainTabParamList, string> = {
  홈: '🏠',
  만들기: '➕',
  채팅: '💬',
  구독: '🗓️',
  내정보: '👤',
};

// 하위 스택에서 상세/글쓰기로 push하면 탭바를 숨긴다.
const SUB_SCREENS = new Set([
  'GroupBuyDetail',
  'GroupBuyCreate',
  'ChatRoom',
  'SubscriptionDetail',
  'MyParticipations',
  'BuildingManage',
  'PaymentMethods',
  'Settlement',
  'Notifications',
  'Admin',
]);

function getTabBarStyle(route: RouteProp<MainTabParamList, keyof MainTabParamList>) {
  const focused = getFocusedRouteNameFromRoute(route);
  if (focused && SUB_SCREENS.has(focused)) return { display: 'none' as const };
  return undefined;
}

export function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: getTabBarStyle(route),
        tabBarIcon: () => <Text>{TAB_ICON[route.name as keyof MainTabParamList]}</Text>,
      })}
    >
      <Tab.Screen name="홈" component={HomeStack} />
      <Tab.Screen
        name="만들기"
        component={HomeStack}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            (navigation as any).navigate('홈', { screen: 'GroupBuyCreate' });
          },
        })}
      />
      <Tab.Screen name="채팅" component={ChatStack} />
      <Tab.Screen name="구독" component={SubscriptionStack} />
      <Tab.Screen
        name="내정보"
        component={MyPageStack}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            (navigation as any).navigate('내정보', { screen: 'MyPageHome' });
          },
        })}
      />
    </Tab.Navigator>
  );
}
