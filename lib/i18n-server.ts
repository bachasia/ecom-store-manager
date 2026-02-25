import { getTranslations } from 'next-intl/server';

export async function getApiTranslations(locale: string = 'en') {
  const t = await getTranslations({ locale, namespace: 'api' });
  return t;
}

export async function getIntegrationTranslations(locale: string = 'en') {
  const t = await getTranslations({ locale, namespace: 'integration' });
  return t;
}
