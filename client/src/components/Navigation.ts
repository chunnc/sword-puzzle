import type { useRouter } from 'expo-router';
type Router = ReturnType<typeof useRouter>;
export function navigateTab(router: Router, id: string): void {
    if (id === 'map')
        router.replace('/map');
    else if (id === 'person')
        router.replace('/character');
    else if (id === 'bag')
        router.replace('/inventory');
    else if (id === 'cultivation')
        router.replace('/realm');
}
