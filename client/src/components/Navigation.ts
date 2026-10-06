import type { useRouter } from 'expo-router';
type Router = ReturnType<typeof useRouter>;
const routes = {
  map: '/map',
  person: '/character',
  bag: '/inventory',
  shop: '/shop',
} as const;

export type BottomNavId = keyof typeof routes;

export function navigateTab(router: Router, id: BottomNavId): void {
  router.replace(routes[id]);
}
