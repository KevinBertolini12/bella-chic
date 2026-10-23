import React, { createContext, useContext, useEffect, useState } from 'react';
import { settingsService } from '../services/settingsService';
import { SalonSettings } from '../types';
import { useSalon } from './SalonContext';

interface SettingsContextType {
  settings: SalonSettings | null;
  loading: boolean;
  refreshSettings: () => Promise<void>;
  updateSection: (section: keyof SalonSettings, data: any) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { salon, settings: salonSettings, loading: salonLoading } = useSalon();
  const [settings, setSettings] = useState<SalonSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!salonLoading) {
      setSettings(salonSettings);
      if (salonSettings) {
        applyTheme(salonSettings);
      }
      setLoading(false);
    }
  }, [salonLoading, salonSettings]);

  const fetchSettings = async () => {
    if (salon) {
      const data = await settingsService.getSettings(salon.id);
      setSettings(data);
      applyTheme(data);
    }
  };

  const applyTheme = (data: SalonSettings) => {
    const root = document.documentElement;
    const { appearance, branding } = data;

    // Update Title and Favicon
    document.title = branding.name;
    let favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      document.head.appendChild(favicon);
    }
    if (branding.faviconURL) {
      favicon.href = branding.faviconURL;
    }

    root.style.setProperty('--primary', appearance.primaryColor);
    root.style.setProperty('--secondary', appearance.secondaryColor);
    root.style.setProperty('--accent', appearance.accentColor);
    root.style.setProperty('--button-bg', appearance.buttonColor);
    root.style.setProperty('--background', appearance.backgroundColor);
    root.style.setProperty('--foreground', appearance.textColor);
    root.style.setProperty('--radius', appearance.borderRadius);
    
    // Set font families
    root.style.setProperty('--font-primary', appearance.fontFamilyPrimary);
    root.style.setProperty('--font-secondary', appearance.fontFamilySecondary);
    
    // Apply theme class
    if (appearance.theme === 'dark') {
      root.classList.add('dark');
    } else if (appearance.theme === 'light') {
      root.classList.remove('dark');
    } else {
      // System preference
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    }
  };

  const updateSection = async (section: keyof SalonSettings, data: any) => {
    if (salon) {
      await settingsService.updateSettings(salon.id, section, data);
      await fetchSettings();
    }
  };

  return (
    <SettingsContext.Provider value={{ settings, loading, refreshSettings: fetchSettings, updateSection }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
