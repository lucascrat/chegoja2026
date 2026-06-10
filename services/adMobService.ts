import { AdMob, AdOptions, AdLoadInfo, InterstitialAdPluginEvents, BannerAdPosition } from '@capacitor-community/admob';

export const AdMobService = {
    initialize: async () => {
        try {
            await AdMob.initialize({
                // Modo de teste ativado
                initializeForTesting: true,
            });
            console.log('AdMob initialized - TEST MODE');
        } catch (e) {
            console.error('AdMob initialization failed', e);
        }
    },

    showInterstitial: async () => {
        try {
            const options: AdOptions = {
                adId: 'ca-app-pub-3940256099942544/1033173712', // Test ID: Interstitial
            };

            await AdMob.prepareInterstitial(options);
            await AdMob.showInterstitial();
        } catch (e) {
            console.error('Failed to show interstitial', e);
        }
    },

    showBanner: async () => {
        try {
            const options: any = {
                adId: 'ca-app-pub-3940256099942544/6300978111', // Test ID: Banner
                position: BannerAdPosition.TOP_CENTER,
                margin: 0,
            };
            await AdMob.showBanner(options);
        } catch (e) {
            console.error('Failed to show banner', e);
        }
    },

    hideBanner: async () => {
        try {
            await AdMob.hideBanner();
        } catch (e) {
            console.error('Failed to hide banner', e);
        }
    },

    resumeBanner: async () => {
        try {
            await AdMob.resumeBanner();
        } catch (e) {
            console.error('Failed to resume banner', e);
        }
    },

    removeBanner: async () => {
        try {
            await AdMob.removeBanner();
        } catch (e) {
            console.error('Failed to remove banner', e);
        }
    },

    showNative: async (parentId: string) => {
        try {
            const options: any = {
                adId: 'ca-app-pub-3940256099942544/2247696110', // Test ID: Native
                parentId: parentId,
                adSize: 'MEDIUM_RECTANGLE',
            };

            // @ts-ignore
            if (AdMob.showNative) {
                // @ts-ignore
                await AdMob.showNative(options);
            } else {
                console.warn("Native Ads not supported by this plugin version directly via JS.");
            }

        } catch (e) {
            console.error('Failed to show native ad', e);
        }
    },

    hideNative: async (parentId: string) => {
        try {
            // @ts-ignore
            if (AdMob.hideNative) {
                // @ts-ignore
                await AdMob.hideNative({ parentId });
            }
        } catch (e) {
            console.error('Failed to hide native ad', e);
        }
    },

    showRewardVideo: async (): Promise<boolean> => {
        try {
            // Check if native platform
            if (!window.Capacitor?.isNativePlatform()) {
                console.log("Simulating Reward Success in Browser");
                return new Promise(resolve => setTimeout(() => resolve(true), 2000));
            }

            const options: any = {
                adId: 'ca-app-pub-3940256099942544/5224354917', // Test ID: Rewarded
            };

            await AdMob.prepareRewardVideoAd(options);
            const reward = await AdMob.showRewardVideoAd();
            return (reward && reward.amount > 0);
        } catch (e) {
            console.error('Failed to show reward video', e);
            return false;
        }
    }
};
