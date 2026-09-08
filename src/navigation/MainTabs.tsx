import React from 'react';
import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { getFocusedRouteNameFromRoute, RouteProp } from '@react-navigation/native';
import { MainTabParamList } from './types';
import { HomeStack } from './HomeStack';
import { ChatStack } from './ChatStack';
import { CommunityStack } from './CommunityStack';
import { ProductsStack } from './ProductsStack';
import { MyPageStack } from './MyPageStack';
import { colors } from '../theme';

const Tab = createBottomTabNavigator<MainTabParamList>();

const TAB_ICON: Record<keyof MainTabParamList, string> = {
  홈: '🏠',
  커뮤니티: '📋',
  채팅: '💬',
  판매상품: '🛒',
  내정보: '👤',
};

// 하위 스택에서 상세/글쓰기 화면으로 push하면 탭바를 숨기고 뒤로가기 헤더로 전환
// (디자인 핸드오프 README "Interactions & Behavior" 참고)
const SUB_SCREENS = new Set([
  'GroupBuyDetail',
  'GroupBuyCreate',
  'ChatRoom',
  'CommunityWrite',
  'MyParticipations',
  'ResidencyManage',
  'PaymentMethods',
  'MyReviews',
  'ReviewWrite',
  'Wishlist',
  'MyGroupBuys',
  'Settlement',
  'CreditDetail',
  'InstallSchedule',
  'SellerProducts',
  'ReceivedQuotes',
  'SentQuotes',
  'ProductCreate',
  'ProductDetail',
  'Notifications',
  'LeaderStore',
  'Admin',
]);

function getTabBarStyle(route: RouteProp<MainTabParamList, keyof MainTabParamList>) {
  const focusedRoute = getFocusedRouteNameFromRoute(route);
  if (focusedRoute && SUB_SCREENS.has(focusedRoute)) {
    return { display: 'none' as const };
  }
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
      <Tab.Screen name="커뮤니티" component={CommunityStack} />
      <Tab.Screen name="채팅" component={ChatStack} />
      <Tab.Screen name="판매상품" component={ProductsStack} />
      <Tab.Screen
        name="내정보"
        component={MyPageStack}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            // 햄버거 메뉴로 Admin 등 하위 화면에 들어갔다 나온 뒤에도, 탭을 다시 누르면
            // 항상 마이페이지 첫 화면으로 돌아오게 한다(React Navigation은 기본적으로
            // 탭 안의 마지막 화면을 그대로 유지하기 때문에 명시적으로 리셋이 필요).
            e.preventDefault();
            (navigation as any).navigate('내정보', { screen: 'MyPageHome' });
          },
        })}
      />
    </Tab.Navigator>
  );
}
