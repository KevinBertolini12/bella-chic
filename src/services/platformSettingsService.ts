import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

export interface PlatformSettings {
  trialDays: number;
  supportEmail: string;
  platformName: string;
}

const DEFAULT_SETTINGS: PlatformSettings = {
  trialDays: 15,
  supportEmail: 'suporte@bellachic.com.br',
  platformName: 'Bella & Chic',
};

const SETTINGS_DOC = 'platform_settings';
const SETTINGS_ID = 'global';

export const platformSettingsService = {
  async getSettings(): Promise<PlatformSettings> {
    const docRef = doc(db, SETTINGS_DOC, SETTINGS_ID);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      return snap.data() as PlatformSettings;
    }
    await setDoc(docRef, DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  },

  async updateSettings(settings: Partial<PlatformSettings>): Promise<void> {
    const docRef = doc(db, SETTINGS_DOC, SETTINGS_ID);
    await updateDoc(docRef, settings);
  },
};